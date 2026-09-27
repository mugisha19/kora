package com.kora.audit;

import static com.kora.support.Contract.conforms;
import static com.kora.support.TestPortfolios.etag;
import static com.kora.support.TestPortfolios.read;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kora.organization.Role;
import com.kora.platform.tenancy.TenantTransactions;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import com.kora.support.TestPortfolios;
import com.kora.support.TestWork;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/**
 * Feature 19 (and the activity feed of feature 18): every change recorded with its fields, refused requests too, in
 * a per-organization hash chain the application can't rewrite and that shows any tampering.
 */
@IntegrationTest
class AuditIT {

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private TenantTransactions transactions;

    private TestAccounts accounts;
    private Session admin;
    private Session manager;
    private Session contributor;
    private String projectId;
    private String task;

    @BeforeEach
    void setUp() {
        accounts = new TestAccounts(mvc, emails);
        TestPortfolios portfolios = new TestPortfolios(mvc);
        admin = accounts.registerOrganization();
        manager = accounts.join(admin, Role.PROJECT_MANAGER);
        contributor = accounts.join(admin, Role.MEMBER);
        projectId = portfolios.project(manager, portfolios.portfolio(admin));
        portfolios.addToTeam(manager, projectId, contributor.userId(), "CONTRIBUTOR");
        task = new TestWork(mvc).task(manager, projectId, "Draft the RFP", "");
    }

    @Test
    void everyChangeIsRecordedWithTheFieldsItChanged() {
        rename(task, "Draft and send the RFP");

        MvcTestResult history = conforms(get("/api/v1/history/task/" + task, contributor));

        assertThat(history)
                .hasStatusOk()
                .bodyJson()
                .extractingPath("$[*].action")
                .isEqualTo(List.of("task.created", "task.updated"));
        assertThat(history).bodyJson().isLenientlyEqualTo("""
                        [{"entityType":"task","entityId":"%s","projectId":"%s","outcome":"SUCCESS"},
                         {"actor":{"userId":"%s"},
                          "changes":{"title":{"before":"Draft the RFP","after":"Draft and send the RFP"}}}]
                        """.formatted(task, projectId, manager.userId()));
    }

    @Test
    void theActivityFeedShowsWhatHappenedOnTheProjectToEveryoneWhoSeesIt() {
        rename(task, "Renamed");

        MvcTestResult feed = conforms(get("/api/v1/projects/" + projectId + "/activity?limit=1", contributor));

        assertThat(feed).hasStatusOk().bodyJson().isLenientlyEqualTo("""
                        {"items":[{"action":"task.updated","entityId":"%s","changedFields":["title"]}]}
                        """.formatted(task));
        String next = read(feed, "$.nextCursor");
        assertThat(conforms(get("/api/v1/projects/" + projectId + "/activity?limit=1&cursor=" + next, contributor)))
                .bodyJson()
                .extractingPath("$.items[0].action")
                .isEqualTo("task.created");
        assertThat(conforms(get("/api/v1/projects/" + projectId + "/activity", accounts.registerOrganization())))
                .hasStatus(HttpStatus.NOT_FOUND);
    }

    @Test
    void refusedRequestsAreRecordedToo() {
        assertThat(conforms(post(
                        "/api/v1/projects/" + projectId + "/stakeholders",
                        contributor,
                        "{\"name\":\"Someone\",\"power\":1,\"interest\":1,\"currentEngagement\":\"UNAWARE\","
                                + "\"desiredEngagement\":\"UNAWARE\"}")))
                .hasStatus(HttpStatus.FORBIDDEN);

        assertThat(conforms(get("/api/v1/audit?action=access.denied", admin)))
                .bodyJson()
                .isLenientlyEqualTo("""
                        {"items":[{"outcome":"DENIED","actor":{"userId":"%s"},"entityType":"request",
                                   "entityLabel":"POST /api/v1/projects/%s/stakeholders"}]}
                        """.formatted(contributor.userId(), projectId));
    }

    @Test
    void theLogIsForAdministratorsAndFiltersByItem() {
        assertThat(conforms(get("/api/v1/audit?entityType=task&entityId=" + task, admin)))
                .bodyJson()
                .extractingPath("$.items[*].action")
                .isEqualTo(List.of("task.created"));
        assertThat(conforms(get("/api/v1/audit", manager))).hasStatus(HttpStatus.FORBIDDEN);
        assertThat(conforms(get("/api/v1/audit?cursor=nonsense", admin)))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("cursor");
    }

    @Test
    void theApplicationCannotRewriteOrEraseTheTrail() {
        assertThatThrownBy(() -> transactions.inOrganization(
                        admin.organizationId(),
                        () -> jdbc.update(
                                "UPDATE audit_events SET action = 'nothing.happened' WHERE entity_id = ?::uuid", task)))
                .rootCause()
                .hasMessageContaining("permission denied");
        assertThatThrownBy(() -> transactions.inOrganization(
                        admin.organizationId(),
                        () -> jdbc.update("DELETE FROM audit_events WHERE entity_id = ?::uuid", task)))
                .rootCause()
                .hasMessageContaining("permission denied");
    }

    @Test
    void verificationFindsTheFirstTamperedEntry() {
        rename(task, "Second");
        assertThat(conforms(get("/api/v1/audit/verify", admin)))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("{\"valid\":true}");

        // Someone with direct database access (not the application's role) edits history.
        String tampered = jdbc.queryForObject(
                "SELECT id::text FROM audit_events WHERE entity_id = ?::uuid AND action = 'task.updated'",
                String.class,
                task);
        jdbc.update("UPDATE audit_events SET action = 'task.viewed' WHERE id = ?::uuid", tampered);

        assertThat(conforms(get("/api/v1/audit/verify", admin)))
                .bodyJson()
                .isLenientlyEqualTo("{\"valid\":false,\"firstBrokenId\":\"%s\"}".formatted(tampered));
        assertThat(conforms(get("/api/v1/audit/verify", manager))).hasStatus(HttpStatus.FORBIDDEN);
    }

    @Test
    void eachOrganizationHasItsOwnChain() {
        Session other = accounts.registerOrganization();

        assertThat(conforms(get("/api/v1/audit?entityId=" + task, other)))
                .bodyJson()
                .isLenientlyEqualTo("{\"items\":[]}");
        assertThat(conforms(get("/api/v1/history/task/" + task, other))).hasStatus(HttpStatus.NOT_FOUND);
        Long gaps = jdbc.queryForObject("""
                SELECT count(*) FROM (
                    SELECT chain_position - lag(chain_position) OVER (ORDER BY chain_position) AS step
                    FROM audit_events WHERE organization_id = ?::uuid) steps
                WHERE step <> 1
                """, Long.class, admin.organizationId().toString());
        assertThat(gaps).isZero();
    }

    private void rename(String taskId, String title) {
        MvcTestResult current = mvc.get()
                .uri("/api/v1/tasks/{id}", taskId)
                .headers(manager.headers())
                .exchange();
        assertThat(conforms(mvc.patch()
                        .uri("/api/v1/tasks/{id}", taskId)
                        .headers(manager.headers())
                        .header(HttpHeaders.IF_MATCH, etag(current))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"%s\"}".formatted(title))
                        .exchange()))
                .hasStatusOk();
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
