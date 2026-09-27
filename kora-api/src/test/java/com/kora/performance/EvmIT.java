package com.kora.performance;

import static com.kora.support.Contract.conforms;
import static com.kora.support.TestPortfolios.read;
import static org.assertj.core.api.Assertions.assertThat;

import com.kora.organization.Role;
import com.kora.performance.application.EvmSnapshotRecorder;
import com.kora.platform.tenancy.TenantTransactions;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import com.kora.support.TestPortfolios;
import com.kora.support.TestWork;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.temporal.IsoFields;
import java.time.temporal.TemporalAdjusters;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/**
 * Feature 17 end to end. The project started three weeks ago with two work packages: Build (100,000, planned and
 * baselined for its first week, half done) and Test (50,000, planned from two weeks ahead). Ten approved hours at
 * 2,000 cost 20,000. So BAC 150,000, PV 100,000, EV 50,000, AC 20,000.
 */
@IntegrationTest
class EvmIT {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Africa/Kigali"));
    private static final LocalDate START = TODAY.minusDays(21).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    @Autowired
    private EvmSnapshotRecorder recorder;

    @Autowired
    private TenantTransactions transactions;

    private Session admin;
    private Session manager;
    private String projectId;

    @BeforeEach
    void setUp() {
        TestAccounts accounts = new TestAccounts(mvc, emails);
        TestPortfolios portfolios = new TestPortfolios(mvc);
        TestWork work = new TestWork(mvc);
        admin = accounts.registerOrganization();
        manager = accounts.join(admin, Role.PROJECT_MANAGER);
        Session member = accounts.join(admin, Role.MEMBER);
        MvcTestResult project = portfolios.createProject(
                manager,
                portfolios.portfolio(admin),
                TestPortfolios.code(),
                START,
                START.plusMonths(6),
                null,
                "HYBRID");
        projectId = read(project, "$.id");
        portfolios.addToTeam(manager, projectId, member.userId(), "CONTRIBUTOR");
        portfolios.start(manager, admin, projectId);

        String build = workPackage("Build", "100000");
        String test = workPackage("Test", "50000");
        String buildIt = work.task(manager, projectId, "Build it", """
                ,"wbsNodeId":"%s","durationDays":5,"estimateHours":10,"remainingHours":5""".formatted(build));
        work.task(manager, projectId, "Test it", """
                ,"wbsNodeId":"%s","durationDays":5,"scheduleConstraint":"START_NO_EARLIER_THAN","constraintDate":"%s"
                """.formatted(test, TODAY.plusDays(14)));
        assertThat(post("/api/v1/projects/" + projectId + "/schedule/baseline", manager, ""))
                .hasStatus(HttpStatus.CREATED);

        assertThat(post(
                        "/api/v1/users/" + member.userId() + "/cost-rates",
                        admin,
                        "{\"hourlyRate\":{\"amount\":\"2000\",\"currency\":\"RWF\"},\"validFrom\":\"%s\"}"
                                .formatted(START.minusDays(30))))
                .hasStatus(HttpStatus.CREATED);
        String week = "%d-W%02d"
                .formatted(START.get(IsoFields.WEEK_BASED_YEAR), START.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR));
        assertThat(mvc.put()
                        .uri("/api/v1/timesheets/me/{week}/entries", week)
                        .headers(member.headers())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"entries\":[{\"taskId\":\"%s\",\"date\":\"%s\",\"hours\":10}]}"
                                .formatted(buildIt, START.plusDays(1))))
                .hasStatusOk();
        assertThat(post("/api/v1/timesheets/me/" + week + "/submit", member, ""))
                .hasStatusOk();
        String sheet = read(get("/api/v1/projects/" + projectId + "/timesheets", manager), "$.content[0].id");
        assertThat(post("/api/v1/timesheets/" + sheet + "/approve", manager, ""))
                .hasStatusOk();
    }

    @Test
    void theMetricsFollowTheTextbookFormulas() {
        assertThat(conforms(get("/api/v1/projects/" + projectId + "/evm", manager)))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("""
                        {"asOf":"%s","percentCompleteMethod":"PHYSICAL","eacMethod":"TYPICAL",
                         "bac":{"amount":"150000"},"pv":{"amount":"100000"},"ev":{"amount":"50000"},
                         "ac":{"amount":"20000"},"sv":{"amount":"-50000"},"cv":{"amount":"30000"},
                         "spi":0.5,"cpi":2.5,"eac":{"amount":"60000"},"etc":{"amount":"40000"},
                         "vac":{"amount":"90000"},"tcpi":0.77,"unratedHours":0,"unavailable":[]}
                        """.formatted(TODAY));
    }

    @Test
    void changingTheEacMethodChangesTheForecast() {
        assertThat(conforms(mvc.put()
                        .uri("/api/v1/projects/{id}/evm/settings", projectId)
                        .headers(manager.headers())
                        .header(HttpHeaders.IF_MATCH, "\"0\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"percentCompleteMethod\":\"PHYSICAL\",\"eacMethod\":\"ATYPICAL\"}")
                        .exchange()))
                .hasStatusOk()
                .hasHeader(HttpHeaders.ETAG, "\"1\"");

        assertThat(conforms(get("/api/v1/projects/" + projectId + "/evm", manager)))
                .bodyJson()
                .isLenientlyEqualTo("""
                        {"eacMethod":"ATYPICAL","eac":{"amount":"120000"},"etc":{"amount":"100000"},
                         "vac":{"amount":"30000"}}
                        """);
    }

    @Test
    void storyPointsWithoutEstimatesLeaveEarnedValueOut() {
        conforms(mvc.put()
                .uri("/api/v1/projects/{id}/evm/settings", projectId)
                .headers(manager.headers())
                .header(HttpHeaders.IF_MATCH, "\"0\"")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"percentCompleteMethod\":\"STORY_POINTS\",\"eacMethod\":\"TYPICAL\"}")
                .exchange());

        MvcTestResult evm = conforms(get("/api/v1/projects/" + projectId + "/evm", manager));
        assertThat(evm).bodyJson().doesNotHavePath("$.ev");
        assertThat(evm)
                .bodyJson()
                .isLenientlyEqualTo("{\"pv\":{\"amount\":\"100000\"},\"unavailable\":[{\"metric\":\"ev\"},{},{},{},{},"
                        + "{},{},{},{}]}");
    }

    @Test
    void anSpiBelowPoint8TurnsTheProjectRedAndReachesTheDashboard() {
        assertThat(conforms(get("/api/v1/projects/" + projectId, manager)))
                .bodyJson()
                .isLenientlyEqualTo(
                        "{\"health\":\"RED\",\"healthReason\":\"Schedule performance index 0.50 is below 0.80\"}");
        assertThat(conforms(get("/api/v1/dashboard/summary", manager)))
                .bodyJson()
                .isLenientlyEqualTo(
                        "{\"portfolioSpi\":0.5,\"portfolioCpi\":2.5,\"totalActualCost\":{\"amount\":\"20000\"}}");
        assertThat(conforms(get("/api/v1/dashboard/projects", manager)))
                .bodyJson()
                .isLenientlyEqualTo("{\"content\":[{\"spi\":0.5,\"cpi\":2.5}]}");
    }

    @Test
    void theSeriesAndTrendsComeFromTheWeeklySnapshots() {
        LocalDate sunday = TODAY.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
        assertThat(conforms(get(
                        "/api/v1/projects/%s/evm/series?from=%s&to=%s".formatted(projectId, TODAY, TODAY.plusWeeks(1)),
                        manager)))
                .bodyJson()
                .isLenientlyEqualTo("""
                        {"bac":{"amount":"150000"},
                         "points":[{"weekEnding":"%s","pv":{"amount":"100000"},"ev":{"amount":"50000"},
                                    "ac":{"amount":"20000"}},
                                   {"weekEnding":"%s"}]}
                        """.formatted(sunday, sunday.plusWeeks(1)));

        UUID organization = admin.organizationId();
        transactions.inOrganization(organization, () -> {
            recorder.record(UUID.fromString(projectId));
            return null;
        });

        assertThat(conforms(get("/api/v1/dashboard/trends?months=1", manager)))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("""
                        {"months":[{"month":"%s","pv":{"amount":"100000"},"ev":{"amount":"50000"},
                                    "ac":{"amount":"20000"},"spi":0.5,"cpi":2.5}]}
                        """.formatted(YearMonth.from(TODAY)));
    }

    private String workPackage(String name, String cost) {
        MvcTestResult node = conforms(post(
                "/api/v1/projects/" + projectId + "/wbs/nodes",
                manager,
                "{\"name\":\"%s\",\"type\":\"WORK_PACKAGE\",\"plannedCost\":\"%s\"}".formatted(name, cost)));
        assertThat(node).hasStatus(HttpStatus.CREATED);
        return read(node, "$.id");
    }

    private MvcTestResult post(String uri, Session session, String body) {
        return mvc.post()
                .uri(uri)
                .headers(session.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .exchange();
    }

    private MvcTestResult get(String uri, Session session) {
        return mvc.get().uri(uri).headers(session.headers()).exchange();
    }
}
