package com.kora.governance;

import static com.kora.support.Contract.conforms;
import static com.kora.support.TestPortfolios.etag;
import static com.kora.support.TestPortfolios.read;
import static org.assertj.core.api.Assertions.assertThat;

import com.kora.organization.Role;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import com.kora.support.TestPortfolios;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/**
 * Feature 14: change requests, the approval chain built from the impact, decisions, and the atomic update of the
 * budget, target end date, charter and schedule baseline on the last approval.
 */
@IntegrationTest
class ChangeRequestIT {

    private static final LocalDate START = LocalDate.now();
    private static final LocalDate END = START.plusMonths(6);

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private Session admin;
    private Session manager;
    private Session pmo;
    private Session sponsor;
    private Session contributor;
    private String projectId;

    @BeforeEach
    void setUp() {
        TestAccounts accounts = new TestAccounts(mvc, emails);
        TestPortfolios portfolios = new TestPortfolios(mvc);
        admin = accounts.registerOrganization();
        manager = accounts.join(admin, Role.PROJECT_MANAGER);
        pmo = accounts.join(admin, Role.PMO);
        sponsor = accounts.join(admin, Role.MEMBER);
        contributor = accounts.join(admin, Role.MEMBER);
        MvcTestResult project = portfolios.createProject(
                manager, portfolios.portfolio(admin), TestPortfolios.code(), START, END, "10000000", "HYBRID");
        assertThat(project).hasStatus(HttpStatus.CREATED);
        projectId = read(project, "$.id");
        portfolios.addToTeam(manager, projectId, contributor.userId(), "CONTRIBUTOR");
        portfolios.start(manager, sponsor, projectId);
    }

    @Test
    void aSmallChangeNeedsOnlyTheProjectManager() {
        String request = submitted(contributor, "300000", 0, false);

        assertThat(conforms(get("/api/v1/change-requests/" + request, manager)))
                .bodyJson()
                .isLenientlyEqualTo("""
                        {"status":"SUBMITTED","steps":[{"position":1,"level":"PROJECT_MANAGER","state":"PENDING",
                          "approver":{"userId":"%s"}}]}
                        """.formatted(manager.userId()));
        assertThat(conforms(get("/api/v1/approvals/pending", manager)))
                .bodyJson()
                .extractingPath("$[*].id")
                .isEqualTo(List.of(request));
        assertThat(conforms(get("/api/v1/approvals/pending", contributor)))
                .bodyJson()
                .isEqualTo("[]");

        assertThat(decide(manager, request, "APPROVE", null))
                .hasStatusOk()
                .bodyJson()
                .extractingPath("$.status")
                .isEqualTo("APPROVED");
        assertThat(conforms(get("/api/v1/projects/" + projectId, manager)))
                .bodyJson()
                .extractingPath("$.budget.amount")
                .isEqualTo("10300000");
    }

    @Test
    void aLargeChangeGoesUpTheChainAndUpdatesEveryBaselineWhenApproved() {
        String request = submitted(contributor, "2000000", 5, true);
        String key = read(get("/api/v1/change-requests/" + request, manager), "$.key");

        assertThat(conforms(get("/api/v1/change-requests/" + request, manager)))
                .bodyJson()
                .extractingPath("$.steps[*].level")
                .isEqualTo(List.of("PROJECT_MANAGER", "PMO", "SPONSOR"));
        assertThat(decide(manager, request, "APPROVE", "Analysis is sound"))
                .bodyJson()
                .isLenientlyEqualTo(
                        "{\"status\":\"IN_REVIEW\",\"steps\":[{\"state\":\"APPROVED\"},{\"state\":\"PENDING\"},"
                                + "{\"state\":\"WAITING\"}]}");
        assertThat(decide(sponsor, request, "APPROVE", null)).hasStatus(HttpStatus.FORBIDDEN);
        assertThat(decide(pmo, request, "APPROVE", null)).hasStatusOk();
        assertThat(conforms(get("/api/v1/approvals/pending", sponsor)))
                .bodyJson()
                .extractingPath("$[*].id")
                .isEqualTo(List.of(request));
        assertThat(decide(sponsor, request, "APPROVE", "Go"))
                .bodyJson()
                .extractingPath("$.status")
                .isEqualTo("APPROVED");

        assertThat(conforms(get("/api/v1/projects/" + projectId, manager)))
                .bodyJson()
                .isLenientlyEqualTo("{\"budget\":{\"amount\":\"12000000\"},\"targetEndDate\":\"%s\"}"
                        .formatted(plusWorkingDays(END, 5)));
        assertThat(conforms(get("/api/v1/projects/" + projectId + "/charter", manager)))
                .bodyJson()
                .isLenientlyEqualTo("""
                        {"versionNumber":2,"status":"APPROVED","inScope":["Mobile wallet (%s)"],
                         "approvedBy":{"userId":"%s"}}
                        """.formatted(key, sponsor.userId()));
        assertThat(conforms(get("/api/v1/projects/" + projectId + "/schedule", manager)))
                .bodyJson()
                .extractingPath("$.baseline.number")
                .isEqualTo(1);
    }

    @Test
    void nobodyDecidesTheirOwnRequest() {
        String request = submitted(manager, "300000", 0, false);

        assertThat(conforms(get("/api/v1/change-requests/" + request, manager)))
                .bodyJson()
                .isLenientlyEqualTo("{\"steps\":[{\"level\":\"PROJECT_MANAGER\",\"approverRole\":\"PMO\"}]}");
        assertThat(decide(manager, request, "APPROVE", null))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("change_requests.self_approval");
        assertThat(decide(contributor, request, "APPROVE", null)).hasStatus(HttpStatus.FORBIDDEN);
        assertThat(decide(pmo, request, "APPROVE", null))
                .bodyJson()
                .isLenientlyEqualTo("{\"status\":\"APPROVED\",\"steps\":[{\"decidedBy\":{\"userId\":\"%s\"}}]}"
                        .formatted(pmo.userId()));
    }

    @Test
    void aRejectedRequestIsRevisedAsANewRevision() {
        String request = submitted(contributor, "300000", 0, false);

        assertThat(decide(manager, request, "REJECT", null))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("comment");
        assertThat(decide(manager, request, "REJECT", "Show the numbers"))
                .bodyJson()
                .extractingPath("$.status")
                .isEqualTo("REJECTED");

        MvcTestResult revision = conforms(post("/api/v1/change-requests/" + request + "/revise", contributor, ""));
        assertThat(revision)
                .hasStatus(HttpStatus.CREATED)
                .bodyJson()
                .isLenientlyEqualTo("{\"revision\":2,\"status\":\"DRAFT\",\"previousRevisionId\":\"%s\",\"steps\":[]}"
                        .formatted(request));
        assertThat(read(revision, "$.key"))
                .isEqualTo(read(get("/api/v1/change-requests/" + request, manager), "$.key"));
        assertThat(conforms(get("/api/v1/change-requests/" + request, manager)))
                .bodyJson()
                .extractingPath("$.status")
                .isEqualTo("REJECTED");
    }

    @Test
    void onlyDraftsAreEditedAndApprovedChangesAreImplementedByTheManager() {
        MvcTestResult draft = draft(contributor, "100000", 0, false, "");
        String request = read(draft, "$.id");

        MvcTestResult edited = conforms(mvc.patch()
                .uri("/api/v1/change-requests/{id}", request)
                .headers(contributor.headers())
                .header(HttpHeaders.IF_MATCH, etag(draft))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"title\":\"Two more testers\"}")
                .exchange());
        assertThat(edited).hasStatusOk();
        assertThat(conforms(post("/api/v1/change-requests/" + request + "/submit", contributor, "")))
                .hasStatusOk();
        assertThat(conforms(mvc.patch()
                        .uri("/api/v1/change-requests/{id}", request)
                        .headers(contributor.headers())
                        .header(HttpHeaders.IF_MATCH, etag(get("/api/v1/change-requests/" + request, contributor)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Too late\"}")
                        .exchange()))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("change_requests.not_draft");

        decide(manager, request, "APPROVE", null);
        assertThat(conforms(post("/api/v1/change-requests/" + request + "/implement", contributor, "")))
                .hasStatus(HttpStatus.FORBIDDEN);
        assertThat(conforms(post("/api/v1/change-requests/" + request + "/implement", manager, "")))
                .bodyJson()
                .extractingPath("$.status")
                .isEqualTo("IMPLEMENTED");

        String withdrawn = submitted(contributor, "100000", 0, false);
        assertThat(conforms(post("/api/v1/change-requests/" + withdrawn + "/withdraw", contributor, "")))
                .bodyJson()
                .isLenientlyEqualTo("{\"status\":\"WITHDRAWN\",\"steps\":[{\"state\":\"SKIPPED\"}]}");
    }

    @Test
    void theOrganizationsThresholdsDecideWhoApproves() {
        assertThat(conforms(get("/api/v1/organization/change-control", manager)))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("{\"pmoCostPercent\":5.0,\"pmoScheduleDays\":10,\"sponsorCostPercent\":15.0,"
                        + "\"version\":0}");
        String settings = "{\"pmoCostPercent\":1,\"pmoScheduleDays\":10,\"sponsorCostPercent\":15}";
        assertThat(conforms(put("/api/v1/organization/change-control", manager, "\"0\"", settings)))
                .hasStatus(HttpStatus.FORBIDDEN);
        assertThat(conforms(put("/api/v1/organization/change-control", admin, "\"0\"", settings)))
                .hasStatusOk()
                .bodyJson()
                .extractingPath("$.version")
                .isEqualTo(1);

        String request = submitted(contributor, "300000", 0, false);
        assertThat(conforms(get("/api/v1/change-requests/" + request, manager)))
                .bodyJson()
                .extractingPath("$.steps[*].level")
                .isEqualTo(List.of("PROJECT_MANAGER", "PMO"));
    }

    @Test
    void aChangeRequestCanDealWithAnIssueAndMustUseTheOrganizationsCurrency() {
        String issue = read(conforms(post("/api/v1/projects/" + projectId + "/issues", contributor, """
                        {"title":"Scope creep","type":"SCOPE","priority":"HIGH"}
                        """)), "$.id");
        String request = read(draft(contributor, "100000", 0, false, ",\"issueId\":\"%s\"".formatted(issue)), "$.id");

        assertThat(conforms(get("/api/v1/issues/" + issue, manager)))
                .bodyJson()
                .extractingPath("$.changeRequestId")
                .isEqualTo(request);
        assertThat(conforms(post("/api/v1/projects/" + projectId + "/change-requests", contributor, """
                        {"title":"Dollars","type":"COST","reason":"Imports",
                         "impact":{"costDelta":{"amount":"100","currency":"USD"}}}
                        """)))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("impact.costDelta.currency");
    }

    private String submitted(Session requester, String cost, int days, boolean charter) {
        String request = read(draft(requester, cost, days, charter, ""), "$.id");
        assertThat(conforms(post("/api/v1/change-requests/" + request + "/submit", requester, "")))
                .hasStatusOk();
        return request;
    }

    private MvcTestResult draft(Session requester, String cost, int days, boolean charter, String extra) {
        MvcTestResult result =
                conforms(post("/api/v1/projects/" + projectId + "/change-requests", requester, """
                {"title":"Add a mobile wallet","type":"SCOPE","reason":"Customers ask for it",
                 "impact":{"costDelta":{"amount":"%s","currency":"RWF"},"scheduleDeltaDays":%d,
                           "scopeSummary":"Mobile wallet","changesCharterScope":%s}%s}
                """.formatted(
                                cost, days, charter, extra)));
        assertThat(result).hasStatus(HttpStatus.CREATED);
        return result;
    }

    private MvcTestResult decide(Session session, String request, String decision, String comment) {
        String commentJson = comment == null ? "" : ",\"comment\":\"%s\"".formatted(comment);
        return conforms(post(
                "/api/v1/change-requests/" + request + "/decisions",
                session,
                "{\"decision\":\"%s\"%s}".formatted(decision, commentJson)));
    }

    private static LocalDate plusWorkingDays(LocalDate date, int days) {
        LocalDate day = date;
        for (int left = days; left > 0; ) {
            day = day.plusDays(1);
            if (day.getDayOfWeek() != DayOfWeek.SATURDAY && day.getDayOfWeek() != DayOfWeek.SUNDAY) {
                left--;
            }
        }
        return day;
    }

    private MvcTestResult post(String uri, Session session, String body) {
        return mvc.post()
                .uri(uri)
                .headers(session.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .exchange();
    }

    private MvcTestResult put(String uri, Session session, String ifMatch, String body) {
        return mvc.put()
                .uri(uri)
                .headers(session.headers())
                .header(HttpHeaders.IF_MATCH, ifMatch)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .exchange();
    }

    private MvcTestResult get(String uri, Session session) {
        return mvc.get().uri(uri).headers(session.headers()).exchange();
    }
}
