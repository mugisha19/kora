package com.kora.notifications;

import static com.kora.support.Contract.conforms;
import static com.kora.support.TestPortfolios.read;
import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.jayway.jsonpath.JsonPath;
import com.kora.governance.application.GovernanceAlerts;
import com.kora.organization.Role;
import com.kora.platform.tenancy.TenantTransactions;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import com.kora.support.TestPortfolios;
import com.kora.support.TestWork;
import com.kora.work.TaskAssigned;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/**
 * Feature 18: notifications from domain events through the transactional outbox, in the app and by email per
 * preference, idempotent on redelivery, and private to their recipient.
 */
@IntegrationTest
class NotificationIT {

    private static final Duration WAIT = Duration.ofSeconds(10);

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    @Autowired
    private TenantTransactions transactions;

    @Autowired
    private ApplicationEventPublisher events;

    @Autowired
    private GovernanceAlerts alerts;

    @Autowired
    private JdbcTemplate jdbc;

    private TestWork work;
    private Session admin;
    private Session manager;
    private Session contributor;
    private String projectId;

    @BeforeEach
    void setUp() {
        TestAccounts accounts = new TestAccounts(mvc, emails);
        TestPortfolios portfolios = new TestPortfolios(mvc);
        work = new TestWork(mvc);
        admin = accounts.registerOrganization();
        manager = accounts.join(admin, Role.PROJECT_MANAGER);
        contributor = accounts.join(admin, Role.MEMBER);
        projectId = portfolios.project(manager, portfolios.portfolio(admin));
        portfolios.addToTeam(manager, projectId, contributor.userId(), "CONTRIBUTOR");
    }

    @Test
    void assigningATaskTellsTheAssigneeInTheAppAndByEmail() {
        int mailed = emails.sentTo(contributor.email()).size();
        String task = work.task(
                manager, projectId, "Draft the RFP", ",\"assigneeId\":\"%s\"".formatted(contributor.userId()));

        MvcTestResult page = awaitNotifications(contributor, 1);

        assertThat(page).bodyJson().isLenientlyEqualTo("""
                        {"unreadCount":1,"items":[{"type":"TASK_ASSIGNED","titleKey":"notifications.task_assigned",
                         "params":{"title":"Draft the RFP","actorId":"%s"},"link":"/projects/%s/tasks/%s"}]}
                        """.formatted(manager.userId(), projectId, task));
        assertThat(page).bodyJson().doesNotHavePath("$.items[0].readAt");
        assertThat(page).bodyJson().doesNotHavePath("$.nextCursor");
        assertThat(emails.awaitEmail(contributor.email(), mailed + 1).body())
                .contains("Draft the RFP")
                .contains("/projects/" + projectId + "/tasks/" + task);
    }

    @Test
    void nobodyIsToldAboutWhatTheyDidThemselves() {
        work.task(manager, projectId, "Mine", ",\"assigneeId\":\"%s\"".formatted(manager.userId()));
        work.task(manager, projectId, "Theirs", ",\"assigneeId\":\"%s\"".formatted(contributor.userId()));

        awaitNotifications(contributor, 1);
        assertThat(conforms(get("/api/v1/notifications", manager)))
                .bodyJson()
                .extractingPath("$.unreadCount")
                .isEqualTo(0);
    }

    @Test
    void notificationsAreReadOneByOneOrAllAtOnceAndOnlyByTheirRecipient() {
        for (int i = 1; i <= 3; i++) {
            work.task(manager, projectId, "Task " + i, ",\"assigneeId\":\"%s\"".formatted(contributor.userId()));
        }
        String newest = read(awaitNotifications(contributor, 3), "$.items[0].id");

        assertThat(conforms(post("/api/v1/notifications/" + newest + "/read", manager)))
                .hasStatus(HttpStatus.NOT_FOUND);
        MvcTestResult read = conforms(post("/api/v1/notifications/" + newest + "/read", contributor));
        assertThat(read).hasStatusOk().bodyJson().hasPath("$.readAt");
        assertThat(conforms(get("/api/v1/notifications?unread=true", contributor)))
                .bodyJson()
                .isLenientlyEqualTo("{\"unreadCount\":2}");

        assertThat(conforms(post("/api/v1/notifications/read-all", contributor)))
                .hasStatus(HttpStatus.NO_CONTENT);
        assertThat(conforms(get("/api/v1/notifications?unread=true", contributor)))
                .bodyJson()
                .isLenientlyEqualTo("{\"unreadCount\":0,\"items\":[]}");
    }

    @Test
    void pagesFollowTheCursorNewestFirst() {
        for (int i = 1; i <= 3; i++) {
            work.task(manager, projectId, "Task " + i, ",\"assigneeId\":\"%s\"".formatted(contributor.userId()));
        }
        awaitNotifications(contributor, 3);

        MvcTestResult first = conforms(get("/api/v1/notifications?limit=2", contributor));
        String cursor = read(first, "$.nextCursor");
        MvcTestResult second = conforms(get("/api/v1/notifications?limit=2&cursor=" + cursor, contributor));

        List<String> titles = List.of(
                read(first, "$.items[0].params.title"),
                read(first, "$.items[1].params.title"),
                read(second, "$.items[0].params.title"));
        assertThat(titles).containsExactly("Task 3", "Task 2", "Task 1");
        assertThat(second).bodyJson().doesNotHavePath("$.nextCursor");
        assertThat(conforms(get("/api/v1/notifications?cursor=not-a-cursor", contributor)))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("cursor");
    }

    @Test
    void preferencesChooseTheChannelsPerKind() {
        assertThat(conforms(get("/api/v1/me/notification-preferences", contributor)))
                .bodyJson()
                .extractingPath("$.preferences[*].email")
                .isEqualTo(List.of(true, true, false, false, false, false));

        assertThat(conforms(mvc.put()
                        .uri("/api/v1/me/notification-preferences")
                        .headers(contributor.authorization())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"preferences\":[{\"type\":\"TASK_ASSIGNED\",\"inApp\":true,\"email\":false}]}")
                        .exchange()))
                .hasStatusOk()
                .bodyJson()
                .extractingPath("$.preferences[0]")
                .isEqualTo(Map.of("type", "TASK_ASSIGNED", "inApp", true, "email", false));

        int mailed = emails.sentTo(contributor.email()).size();
        work.task(manager, projectId, "Quiet", ",\"assigneeId\":\"%s\"".formatted(contributor.userId()));
        awaitNotifications(contributor, 1);
        await().during(Duration.ofMillis(500))
                .atMost(WAIT)
                .until(() -> emails.sentTo(contributor.email()).size() == mailed);
    }

    @Test
    void aSubmittedChangeRequestAsksItsApproverAndTheDecisionReachesTheRequester() {
        new TestPortfolios(mvc).start(manager, admin, projectId);
        String request =
                read(conforms(post("/api/v1/projects/" + projectId + "/change-requests", contributor, """
                        {"title":"Add a wallet","type":"SCOPE","reason":"Customers ask",
                         "impact":{"costDelta":{"amount":"1000","currency":"RWF"},"scheduleDeltaDays":0,
                                   "scopeSummary":"Wallet","changesCharterScope":false}}
                        """)), "$.id");
        assertThat(conforms(post("/api/v1/change-requests/" + request + "/submit", contributor)))
                .hasStatusOk();

        assertThat(awaitNotifications(manager, 1)).bodyJson().isLenientlyEqualTo("""
                        {"items":[{"type":"APPROVAL_REQUESTED","params":{"title":"Add a wallet"},
                                   "link":"/projects/%s/change-requests/%s"}]}
                        """.formatted(projectId, request));

        assertThat(conforms(post(
                        "/api/v1/change-requests/" + request + "/decisions",
                        manager,
                        "{\"decision\":\"REJECT\",\"comment\":\"Not this quarter\"}")))
                .hasStatusOk()
                .bodyJson()
                .extractingPath("$.status")
                .isEqualTo("REJECTED");
        assertThat(awaitNotifications(contributor, 1)).bodyJson().isLenientlyEqualTo("""
                        {"items":[{"type":"CHANGE_REQUEST_DECIDED","params":{"approved":false}}]}
                        """);
    }

    @Test
    void anOverdueRiskReviewRemindsItsOwnerOnceADay() {
        LocalDate yesterday = LocalDate.now(ZoneId.of("Africa/Kigali")).minusDays(1);
        assertThat(conforms(post("/api/v1/projects/" + projectId + "/risks", manager, """
                        {"title":"Vendor delay","kind":"THREAT","category":"EXTERNAL","probability":3,"impact":3,
                         "ownerId":"%s","reviewDate":"%s"}
                        """.formatted(
                                contributor.userId(), yesterday))))
                .hasStatus(HttpStatus.CREATED);

        raiseAlerts();
        raiseAlerts();

        assertThat(awaitNotifications(contributor, 1))
                .bodyJson()
                .isLenientlyEqualTo("{\"items\":[{\"type\":\"RISK_REVIEW_OVERDUE\"}]}");
        // Give a second delivery time to show up, if the key didn't stop it.
        await().during(Duration.ofSeconds(1)).atMost(WAIT).until(() -> unread(contributor) == 1);
    }

    @Test
    void aRolledBackChangeNotifiesNobodyWhileACommittedOneAlwaysDoes() {
        TaskAssigned lost = assignment("Rolled back");
        try {
            transactions.inOrganization(admin.organizationId(), () -> {
                events.publishEvent(lost);
                throw new IllegalStateException("the change fails after announcing it");
            });
        } catch (IllegalStateException expected) {
            // rolled back
        }
        TaskAssigned kept = assignment("Committed");
        transactions.inOrganization(admin.organizationId(), () -> {
            events.publishEvent(kept);
            return null;
        });

        assertThat(awaitNotifications(contributor, 1))
                .bodyJson()
                .extractingPath("$.items[*].params.title")
                .isEqualTo(List.of("Committed"));
        // The outbox kept the committed event until its listener finished, and nothing of the other.
        await().atMost(WAIT)
                .until(() -> jdbc.queryForObject(
                                "SELECT count(*) FROM event_publication WHERE serialized_event LIKE ?"
                                        + " AND completion_date IS NOT NULL",
                                Integer.class,
                                "%" + kept.eventKey() + "%")
                        == 1);
        assertThat(jdbc.queryForObject(
                        "SELECT count(*) FROM event_publication WHERE serialized_event LIKE ?",
                        Integer.class,
                        "%" + lost.eventKey() + "%"))
                .isZero();
    }

    private TaskAssigned assignment(String title) {
        return new TaskAssigned(
                UUID.randomUUID().toString(),
                admin.organizationId(),
                UUID.fromString(projectId),
                UUID.randomUUID(),
                "T-0",
                title,
                contributor.userId(),
                manager.userId());
    }

    private void raiseAlerts() {
        transactions.inOrganization(admin.organizationId(), () -> {
            alerts.raise(admin.organizationId());
            return null;
        });
    }

    private MvcTestResult awaitNotifications(Session session, int count) {
        await().atMost(WAIT).until(() -> unread(session) >= count);
        return conforms(get("/api/v1/notifications", session));
    }

    private int unread(Session session) {
        Integer unread = JsonPath.read(TestAccounts.body(get("/api/v1/notifications", session)), "$.unreadCount");
        return unread;
    }

    private MvcTestResult get(String uri, Session session) {
        return mvc.get().uri(uri).headers(session.headers()).exchange();
    }

    private MvcTestResult post(String uri, Session session) {
        return mvc.post().uri(uri).headers(session.headers()).exchange();
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
