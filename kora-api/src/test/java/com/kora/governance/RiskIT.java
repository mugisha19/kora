package com.kora.governance;

import static com.kora.support.Contract.conforms;
import static com.kora.support.TestPortfolios.etag;
import static com.kora.support.TestPortfolios.read;
import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.kora.organization.Role;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import com.kora.support.TestPortfolios;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/** Feature 11: the risk register, assessments, the heat map, materializing, the PMO view and project health. */
@IntegrationTest
class RiskIT {

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private TestAccounts accounts;
    private TestPortfolios portfolios;
    private Session admin;
    private Session manager;
    private Session contributor;
    private String portfolioId;
    private String projectId;
    private String projectCode;

    @BeforeEach
    void setUp() {
        accounts = new TestAccounts(mvc, emails);
        portfolios = new TestPortfolios(mvc);
        admin = accounts.registerOrganization();
        manager = accounts.join(admin, Role.PROJECT_MANAGER);
        contributor = accounts.join(admin, Role.MEMBER);
        portfolioId = portfolios.portfolio(admin);
        projectId = portfolios.project(manager, portfolioId);
        projectCode = read(get("/api/v1/projects/" + projectId, manager), "$.code");
        portfolios.addToTeam(manager, projectId, contributor.userId(), "CONTRIBUTOR");
    }

    @Test
    void aRaisedRiskIsScoredKeyedAndAssessed() {
        MvcTestResult created = raise(contributor, "Vendor delay", "THREAT", 4, 5, "");

        assertThat(created).hasStatus(HttpStatus.CREATED).bodyJson().isLenientlyEqualTo("""
                        {"key":"%s-R1","status":"IDENTIFIED","score":20,"severity":"CRITICAL",
                         "identifiedBy":{"fullName":"MEMBER User"},"reviewOverdue":false}
                        """.formatted(projectCode));
        String risk = read(created, "$.id");

        assertThat(conforms(post("/api/v1/risks/" + risk + "/assessments", manager, """
                        {"probability":2,"impact":5,"residualProbability":1,"residualImpact":3,"note":"Second vendor"}
                        """)))
                .hasStatus(HttpStatus.CREATED)
                .bodyJson()
                .isLenientlyEqualTo("{\"score\":10,\"note\":\"Second vendor\"}");
        assertThat(conforms(get("/api/v1/risks/" + risk + "/assessments", manager)))
                .bodyJson()
                .extractingPath("$[*].score")
                .isEqualTo(List.of(20, 10));
        assertThat(conforms(get("/api/v1/risks/" + risk, manager)))
                .bodyJson()
                .isLenientlyEqualTo("{\"status\":\"ANALYZED\",\"score\":10,\"severity\":\"HIGH\",\"residualScore\":3}");
    }

    @Test
    void theRegisterAndTheHeatMapAgree() {
        raise(manager, "Outage", "THREAT", 5, 5, "");
        raise(manager, "Strike", "THREAT", 5, 5, "");
        raise(manager, "Early delivery", "OPPORTUNITY", 2, 3, "");
        String closed = read(raise(manager, "Old news", "THREAT", 1, 1, ""), "$.id");
        assertThat(conforms(post("/api/v1/risks/" + closed + "/close", manager, "{\"note\":\"Expired\"}")))
                .hasStatusOk();

        assertThat(conforms(get("/api/v1/projects/" + projectId + "/risks", manager)))
                .bodyJson()
                .extractingPath("$.content[*].title")
                .isEqualTo(List.of("Outage", "Strike", "Early delivery", "Old news"));
        assertThat(conforms(get("/api/v1/projects/" + projectId + "/risks?minScore=15", manager)))
                .bodyJson()
                .extractingPath("$.totalElements")
                .isEqualTo(2);

        MvcTestResult heatmap = conforms(get("/api/v1/projects/" + projectId + "/risks/heatmap", manager));
        assertThat(heatmap).hasStatusOk();
        String body = TestAccounts.body(heatmap);
        List<Integer> counts = JsonPath.read(body, "$.cells[*].count");
        assertThat(counts).hasSize(25);
        assertThat(counts.stream().mapToInt(Integer::intValue).sum()).isEqualTo(3);
        assertThat((Integer) JsonPath.read(body, "$.cells[4].count")).isEqualTo(2);
        assertThat((String) JsonPath.read(body, "$.cells[4].severity")).isEqualTo("CRITICAL");
        assertThat((Integer) JsonPath.read(body, "$.cells[4].score")).isEqualTo(25);
        assertThat(conforms(get("/api/v1/projects/" + projectId + "/risks/heatmap?kind=OPPORTUNITY", manager)))
                .bodyJson()
                .extractingPath("$.cells[17].count")
                .isEqualTo(1);
    }

    @Test
    void responsesMustSuitTheRiskAndClosedRisksAreHistory() {
        MvcTestResult created = raise(manager, "Currency swing", "THREAT", 3, 3, "");
        String risk = read(created, "$.id");

        assertThat(patch(risk, etag(created), "{\"responseStrategy\":\"EXPLOIT\"}"))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("responseStrategy");
        assertThat(patch(risk, etag(created), "{\"status\":\"RESPONSE_PLANNED\"}"))
                .hasStatus(HttpStatus.BAD_REQUEST);
        MvcTestResult planned = patch(
                risk,
                etag(created),
                "{\"responseStrategy\":\"TRANSFER\",\"responsePlan\":\"Hedge with the bank\",\"status\":\"RESPONSE_PLANNED\"}");
        assertThat(planned).hasStatusOk().bodyJson().extractingPath("$.status").isEqualTo("RESPONSE_PLANNED");

        assertThat(conforms(post("/api/v1/risks/" + risk + "/close", manager, "{\"note\":\"Rates fixed\"}")))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("{\"status\":\"CLOSED\",\"closure\":\"EXPIRED\",\"closureNote\":\"Rates fixed\"}");
        assertThat(conforms(
                        post("/api/v1/risks/" + risk + "/assessments", manager, "{\"probability\":1,\"impact\":1}")))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("risks.closed");
    }

    @Test
    void onlyTheOwnerOrAManagerChangesARisk() {
        Session other = accounts.join(admin, Role.MEMBER);
        portfolios.addToTeam(manager, projectId, other.userId(), "CONTRIBUTOR");
        MvcTestResult created = raise(
                manager, "Key person leaves", "THREAT", 2, 4, ",\"ownerId\":\"%s\"".formatted(contributor.userId()));
        String risk = read(created, "$.id");

        assertThat(conforms(post("/api/v1/risks/" + risk + "/assessments", other, "{\"probability\":1,\"impact\":1}")))
                .hasStatus(HttpStatus.FORBIDDEN);
        assertThat(conforms(post(
                        "/api/v1/risks/" + risk + "/assessments", contributor, "{\"probability\":3,\"impact\":4}")))
                .hasStatus(HttpStatus.CREATED);
    }

    @Test
    void aMaterializedRiskBecomesALinkedIssueInOneStep() {
        String risk = read(
                raise(
                        manager,
                        "Data centre flood",
                        "THREAT",
                        4,
                        4,
                        ",\"ownerId\":\"%s\"".formatted(contributor.userId())),
                "$.id");

        MvcTestResult issue = conforms(post("/api/v1/risks/" + risk + "/materialize", manager, "{}"));

        assertThat(issue).hasStatus(HttpStatus.CREATED).bodyJson().isLenientlyEqualTo("""
                        {"key":"%s-I1","title":"Data centre flood","priority":"CRITICAL","status":"OPEN","riskId":"%s",
                         "owner":{"userId":"%s"}}
                        """.formatted(
                        projectCode, risk, contributor.userId()));
        assertThat(conforms(get("/api/v1/risks/" + risk, manager))).bodyJson().isLenientlyEqualTo("""
                        {"status":"CLOSED","closure":"MATERIALIZED","issueId":"%s"}
                        """.formatted(
                        read(issue, "$.id")));
        assertThat(conforms(post("/api/v1/risks/" + risk + "/materialize", manager, "{}")))
                .hasStatus(HttpStatus.CONFLICT);
    }

    @Test
    void thePmoSeesCriticalRisksAcrossTheProjectsItCanSee() {
        Session pmo = accounts.join(admin, Role.PMO);
        String otherProject = portfolios.project(admin, portfolios.portfolio(admin));
        raise(manager, "Critical here", "THREAT", 5, 4, "");
        raise(manager, "Minor here", "THREAT", 1, 2, "");
        raise(admin, "Critical elsewhere", "THREAT", 5, 5, "", otherProject);

        assertThat(conforms(get("/api/v1/risks", pmo)))
                .bodyJson()
                .extractingPath("$.content[*].title")
                .isEqualTo(List.of("Critical elsewhere", "Critical here"));
        assertThat(conforms(get("/api/v1/risks?portfolioId=" + portfolioId, pmo)))
                .bodyJson()
                .extractingPath("$.content[*].title")
                .isEqualTo(List.of("Critical here"));
        assertThat(conforms(get("/api/v1/risks?minScore=1", contributor)))
                .bodyJson()
                .extractingPath("$.content[*].title")
                .isEqualTo(List.of("Critical here", "Minor here"));
    }

    @Test
    void aCriticalRiskPastItsReviewTurnsTheProjectRed() {
        Session sponsor = accounts.join(admin, Role.PMO);
        portfolios.start(manager, sponsor, projectId);
        LocalDate yesterday = LocalDate.now(ZoneId.of("Africa/Kigali")).minusDays(1);

        raise(manager, "Regulator blocks launch", "THREAT", 5, 5, ",\"reviewDate\":\"%s\"".formatted(yesterday));

        assertThat(conforms(get("/api/v1/projects/" + projectId, manager)))
                .bodyJson()
                .isLenientlyEqualTo("""
                        {"health":"RED","healthReason":"A critical risk is open past its response date"}
                        """);
    }

    private MvcTestResult raise(Session session, String title, String kind, int probability, int impact, String extra) {
        return raise(session, title, kind, probability, impact, extra, projectId);
    }

    private MvcTestResult raise(
            Session session, String title, String kind, int probability, int impact, String extra, String project) {
        return conforms(post("/api/v1/projects/" + project + "/risks", session, """
                {"title":"%s","kind":"%s","category":"EXTERNAL","probability":%d,"impact":%d%s}
                """.formatted(
                        title, kind, probability, impact, extra)));
    }

    private MvcTestResult patch(String risk, String etag, String body) {
        return conforms(mvc.patch()
                .uri("/api/v1/risks/{id}", risk)
                .headers(manager.headers())
                .header(HttpHeaders.IF_MATCH, etag)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .exchange());
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
