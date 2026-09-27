package com.kora.reports;

import static com.kora.support.Contract.conforms;
import static com.kora.support.TestPortfolios.read;
import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.jayway.jsonpath.JsonPath;
import com.kora.organization.Role;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import com.kora.support.TestPortfolios;
import com.kora.support.TestWork;
import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.openpdf.text.pdf.PdfReader;
import org.openpdf.text.pdf.parser.PdfTextExtractor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/**
 * Feature 21: reports requested over the API, generated in the background as the requester, stored, downloadable
 * for a week and announced by a notification; in the requester's language, with Excel safe from formula injection.
 */
@IntegrationTest
class ReportIT {

    private static final Duration WAIT = Duration.ofSeconds(30);
    private static final HttpClient HTTP = HttpClient.newHttpClient();

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    @Autowired
    private JdbcTemplate jdbc;

    private TestAccounts accounts;
    private Session admin;
    private Session manager;
    private Session contributor;
    private String projectId;

    @BeforeEach
    void setUp() {
        accounts = new TestAccounts(mvc, emails);
        TestPortfolios portfolios = new TestPortfolios(mvc);
        admin = accounts.registerOrganization();
        manager = accounts.join(admin, Role.PROJECT_MANAGER);
        contributor = accounts.join(admin, Role.MEMBER);
        projectId = portfolios.project(manager, portfolios.portfolio(admin));
        portfolios.addToTeam(manager, projectId, contributor.userId(), "CONTRIBUTOR");
    }

    @Test
    void aProjectStatusReportIsGeneratedStoredAndAnnounced() throws Exception {
        raiseRisk("Vendor delay", 4, 5);
        new TestWork(mvc).task(manager, projectId, "Draft the RFP", "");

        MvcTestResult requested =
                request(contributor, "PROJECT_STATUS", "PDF", "{\"projectId\":\"%s\"}".formatted(projectId));

        assertThat(requested).hasStatus(HttpStatus.ACCEPTED).bodyJson().isLenientlyEqualTo("""
                        {"type":"PROJECT_STATUS","format":"PDF","status":"QUEUED","params":{"projectId":"%s"}}
                        """.formatted(projectId));
        String id = read(requested, "$.id");
        assertThat(requested.getResponse().getHeader("Location")).isEqualTo("/api/v1/reports/" + id);

        MvcTestResult ready = awaitReady(contributor, id);
        assertThat(ready).bodyJson().isLenientlyEqualTo("{\"status\":\"READY\"}");
        assertThat(read(ready, "$.fileName"))
                .startsWith("project-status-report-")
                .endsWith(".pdf");
        String text = pdfText(download(ready));
        assertThat(text).contains("Project status report", "Vendor delay", "Top open risks");

        await().atMost(WAIT).until(() -> unread(contributor) >= 1);
        assertThat(conforms(get("/api/v1/notifications", contributor)))
                .bodyJson()
                .isLenientlyEqualTo("""
                        {"items":[{"type":"REPORT_READY","link":"/reports",
                                   "params":{"reportId":"%s","type":"PROJECT_STATUS","format":"PDF"}}]}
                        """.formatted(id));
    }

    @Test
    void excelExportsKeepHostileTextInert() throws Exception {
        raiseRisk("=HYPERLINK(\\\"http://evil.example\\\",\\\"Click\\\")", 5, 5);
        raiseRisk("Harmless", 1, 1);

        MvcTestResult ready = awaitReady(
                manager,
                read(request(manager, "RISK_REGISTER", "XLSX", "{\"projectId\":\"%s\"}".formatted(projectId)), "$.id"));

        try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(download(ready)))) {
            Sheet risks = workbook.getSheetAt(1);
            Cell hostile = risks.getRow(1).getCell(2);
            assertThat(hostile.getStringCellValue()).startsWith("=HYPERLINK");
            assertThat(hostile.getCellStyle().getQuotePrefixed()).isTrue();
            assertThat(risks.getRow(1).getCell(7).getNumericCellValue()).isEqualTo(25.0);
            assertThat(risks.getRow(2).getCell(2).getCellStyle().getQuotePrefixed())
                    .isFalse();
        }
    }

    @Test
    void everyTypeAndFormatCanBeGenerated() {
        for (String[] report : new String[][] {
            {"EVM", "{\"projectId\":\"%s\"}".formatted(projectId)},
            {"PORTFOLIO_SUMMARY", "{}"},
            {"RISK_REGISTER", "{}"},
            {"TIMESHEETS", "{\"projectId\":\"%s\"}".formatted(projectId)}
        }) {
            for (String format : new String[] {"PDF", "XLSX"}) {
                String id = read(request(manager, report[0], format, report[1]), "$.id");
                assertThat(awaitReady(manager, id))
                        .as(report[0] + " " + format)
                        .bodyJson()
                        .extractingPath("$.status")
                        .isEqualTo("READY");
            }
        }
    }

    @Test
    void reportsAreInTheRequestersLanguage() throws Exception {
        assertThat(conforms(mvc.patch()
                        .uri("/api/v1/me")
                        .headers(manager.authorization())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"locale\":\"fr\"}")
                        .exchange()))
                .hasStatusOk();

        MvcTestResult ready = awaitReady(
                manager,
                read(request(manager, "RISK_REGISTER", "PDF", "{\"projectId\":\"%s\"}".formatted(projectId)), "$.id"));

        assertThat(pdfText(download(ready))).contains("Registre des risques");
    }

    @Test
    void accessIsCheckedWhenAskingNotWhenItFails() {
        assertThat(conforms(request(contributor, "TIMESHEETS", "PDF", "{\"projectId\":\"%s\"}".formatted(projectId))))
                .hasStatus(HttpStatus.FORBIDDEN);
        assertThat(conforms(request(manager, "EVM", "PDF", "{}")))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("params.projectId");
        assertThat(conforms(request(
                        manager,
                        "TIMESHEETS",
                        "XLSX",
                        "{\"projectId\":\"%s\",\"from\":\"2026-01-01\",\"to\":\"2026-12-31\"}".formatted(projectId))))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("params.to");
        Session stranger = accounts.registerOrganization();
        assertThat(conforms(request(stranger, "PROJECT_STATUS", "PDF", "{\"projectId\":\"%s\"}".formatted(projectId))))
                .hasStatus(HttpStatus.NOT_FOUND);
        assertThat(conforms(request(
                        manager, "PORTFOLIO_SUMMARY", "PDF", "{\"portfolioId\":\"%s\"}".formatted(UUID.randomUUID()))))
                .hasStatus(HttpStatus.NOT_FOUND);
    }

    @Test
    void jobsArePrivateToTheirRequester() {
        String id = read(request(manager, "EVM", "XLSX", "{\"projectId\":\"%s\"}".formatted(projectId)), "$.id");

        assertThat(conforms(get("/api/v1/reports/" + id, admin))).hasStatus(HttpStatus.NOT_FOUND);
        assertThat(conforms(get("/api/v1/reports", admin))).bodyJson().isEqualTo("[]");
        assertThat(conforms(get("/api/v1/reports", manager)))
                .bodyJson()
                .extractingPath("$[0].id")
                .isEqualTo(id);
    }

    @Test
    void onlyAFewReportsCanWaitAtOnce() {
        for (int i = 0; i < 5; i++) {
            jdbc.update("""
                    INSERT INTO report_jobs (id, organization_id, requested_by, type, format, locale, status, created_at,
                                             expires_at)
                    VALUES (?, ?, ?, 'EVM', 'PDF', 'en', 'QUEUED', now(), now() + interval '7 days')
                    """, UUID.randomUUID(), admin.organizationId(), contributor.userId());
        }

        assertThat(conforms(
                        request(contributor, "PROJECT_STATUS", "PDF", "{\"projectId\":\"%s\"}".formatted(projectId))))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("reports.too_many_pending");
    }

    private void raiseRisk(String title, int probability, int impact) {
        assertThat(conforms(post("/api/v1/projects/" + projectId + "/risks", manager, """
                        {"title":"%s","kind":"THREAT","category":"EXTERNAL","probability":%d,"impact":%d}
                        """.formatted(
                                title, probability, impact))))
                .hasStatus(HttpStatus.CREATED);
    }

    private MvcTestResult request(Session session, String type, String format, String params) {
        return post(
                "/api/v1/reports",
                session,
                "{\"type\":\"%s\",\"format\":\"%s\",\"params\":%s}".formatted(type, format, params));
    }

    private MvcTestResult awaitReady(Session session, String id) {
        await().atMost(WAIT).until(() -> {
            String status = JsonPath.read(TestAccounts.body(get("/api/v1/reports/" + id, session)), "$.status");
            assertThat(status).isNotEqualTo("FAILED");
            return status.equals("READY");
        });
        MvcTestResult ready = conforms(get("/api/v1/reports/" + id, session));
        assertThat(Instant.parse(read(ready, "$.downloadExpiresAt"))).isAfter(Instant.now());
        return ready;
    }

    private static byte[] download(MvcTestResult ready) throws Exception {
        HttpResponse<byte[]> file = HTTP.send(
                HttpRequest.newBuilder(URI.create(read(ready, "$.downloadUrl"))).build(),
                HttpResponse.BodyHandlers.ofByteArray());
        assertThat(file.statusCode()).isEqualTo(200);
        assertThat(file.headers().firstValue("Content-Disposition"))
                .hasValueSatisfying(value -> assertThat(value).startsWith("attachment"));
        return file.body();
    }

    private static String pdfText(byte[] pdf) throws Exception {
        Path copy = Files.createTempFile("report-it-", ".pdf");
        Files.write(copy, pdf);
        PdfReader reader = new PdfReader(pdf);
        try {
            PdfTextExtractor extractor = new PdfTextExtractor(reader);
            StringBuilder text = new StringBuilder();
            for (int page = 1; page <= reader.getNumberOfPages(); page++) {
                text.append(extractor.getTextFromPage(page)).append('\n');
            }
            return text.toString().replaceAll("\\s+", " ");
        } finally {
            reader.close();
            Files.deleteIfExists(copy);
        }
    }

    private int unread(Session session) {
        Integer unread = JsonPath.read(TestAccounts.body(get("/api/v1/notifications", session)), "$.unreadCount");
        return unread;
    }

    private MvcTestResult get(String uri, Session session) {
        return mvc.get().uri(uri).headers(session.headers()).exchange();
    }

    private MvcTestResult post(String uri, Session session, String body) {
        return mvc.post()
                .uri(uri)
                .headers(session.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .exchange();
    }
}
