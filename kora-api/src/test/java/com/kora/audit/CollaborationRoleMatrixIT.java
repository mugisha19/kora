package com.kora.audit;

import static com.kora.support.Contract.conforms;
import static com.kora.support.TestPortfolios.read;
import static org.assertj.core.api.Assertions.assertThat;

import com.kora.organization.Role;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import com.kora.support.TestPortfolios;
import com.kora.support.TestWork;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/**
 * Features 18–20: who may read notifications, the activity feed, the audit trail and item histories, and who may
 * upload, complete, list, download and delete attachments, one test per actor per endpoint.
 */
@IntegrationTest
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class CollaborationRoleMatrixIT {

    enum Actor {
        ORG_ADMIN,
        PMO,
        THE_MANAGER,
        CONTRIBUTOR,
        OBSERVER,
        VIEWER_AS_CONTRIBUTOR
    }

    private static final byte[] PDF = "%PDF-1.7\n%%EOF\n".getBytes(StandardCharsets.US_ASCII);
    private static final Set<Actor> ADMINS = Set.of(Actor.ORG_ADMIN);
    private static final Set<Actor> GOVERNORS = Set.of(Actor.ORG_ADMIN, Actor.PMO);
    private static final Set<Actor> WORKERS = Set.of(Actor.ORG_ADMIN, Actor.PMO, Actor.THE_MANAGER, Actor.CONTRIBUTOR);
    private static final Set<Actor> UPLOADER = Set.of(Actor.CONTRIBUTOR);
    private static final Set<Actor> UPLOADER_AND_MANAGERS = WORKERS;
    private static final Set<Actor> EVERYONE = Set.of(Actor.values());

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private final Map<Actor, Session> sessions = new EnumMap<>(Actor.class);
    private String projectId;
    private String portfolioId;
    private String task;
    private String available;

    @BeforeAll
    void createTheCast() throws Exception {
        TestAccounts accounts = new TestAccounts(mvc, emails);
        TestPortfolios portfolios = new TestPortfolios(mvc);
        Session admin = accounts.registerOrganization();
        sessions.put(Actor.ORG_ADMIN, admin);
        sessions.put(Actor.PMO, accounts.join(admin, Role.PMO));
        sessions.put(Actor.THE_MANAGER, accounts.join(admin, Role.PROJECT_MANAGER));
        sessions.put(Actor.CONTRIBUTOR, accounts.join(admin, Role.MEMBER));
        sessions.put(Actor.OBSERVER, accounts.join(admin, Role.MEMBER));
        sessions.put(Actor.VIEWER_AS_CONTRIBUTOR, accounts.join(admin, Role.VIEWER));
        Session manager = sessions.get(Actor.THE_MANAGER);
        portfolioId = portfolios.portfolio(admin);
        projectId = portfolios.project(manager, portfolioId);
        portfolios.addToTeam(manager, projectId, contributor().userId(), "CONTRIBUTOR");
        portfolios.addToTeam(
                manager, projectId, sessions.get(Actor.VIEWER_AS_CONTRIBUTOR).userId(), "CONTRIBUTOR");
        portfolios.addToTeam(manager, projectId, sessions.get(Actor.OBSERVER).userId(), "OBSERVER");
        task = new TestWork(mvc).task(manager, projectId, "Matrix", "");

        MvcTestResult started = startUpload(contributor());
        HttpClient.newHttpClient()
                .send(
                        HttpRequest.newBuilder(URI.create(read(started, "$.uploadUrl")))
                                .header("Content-Type", "application/pdf")
                                .PUT(HttpRequest.BodyPublishers.ofByteArray(PDF))
                                .build(),
                        HttpResponse.BodyHandlers.discarding());
        available = read(started, "$.attachment.id");
        assertThat(post("/api/v1/attachments/" + available + "/complete", contributor(), null))
                .hasStatusOk();
    }

    enum Endpoint {
        LIST_NOTIFICATIONS(EVERYONE, HttpStatus.OK),
        MARK_NOTIFICATION_READ(EVERYONE, HttpStatus.NOT_FOUND),
        MARK_ALL_READ(EVERYONE, HttpStatus.NO_CONTENT),
        READ_PREFERENCES(EVERYONE, HttpStatus.OK),
        UPDATE_PREFERENCES(EVERYONE, HttpStatus.OK),
        READ_ACTIVITY(EVERYONE, HttpStatus.OK),
        READ_AUDIT_LOG(ADMINS, HttpStatus.OK),
        VERIFY_AUDIT(ADMINS, HttpStatus.OK),
        READ_PROJECT_ITEM_HISTORY(EVERYONE, HttpStatus.OK),
        READ_ORGANIZATION_ITEM_HISTORY(GOVERNORS, HttpStatus.OK),
        START_UPLOAD(WORKERS, HttpStatus.CREATED),
        COMPLETE_UPLOAD(UPLOADER, HttpStatus.CONFLICT),
        LIST_ATTACHMENTS(EVERYONE, HttpStatus.OK),
        DOWNLOAD_ATTACHMENT(EVERYONE, HttpStatus.OK),
        DELETE_ATTACHMENT(UPLOADER_AND_MANAGERS, HttpStatus.NO_CONTENT);

        private final Set<Actor> allowed;
        private final HttpStatus whenAllowed;

        Endpoint(Set<Actor> allowed, HttpStatus whenAllowed) {
            this.allowed = allowed;
            this.whenAllowed = whenAllowed;
        }
    }

    static Stream<Arguments> everyActorOnEveryEndpoint() {
        return Arrays.stream(Endpoint.values())
                .flatMap(endpoint -> Arrays.stream(Actor.values()).map(actor -> Arguments.of(endpoint, actor)));
    }

    @ParameterizedTest(name = "{1} on {0}")
    @MethodSource("everyActorOnEveryEndpoint")
    void permissionsAreEnforcedByTheApi(Endpoint endpoint, Actor actor) {
        MvcTestResult result = conforms(call(endpoint, sessions.get(actor)));

        if (endpoint.allowed.contains(actor)) {
            assertThat(result).hasStatus(endpoint.whenAllowed);
        } else {
            assertThat(result)
                    .hasStatus(HttpStatus.FORBIDDEN)
                    .bodyJson()
                    .extractingPath("$.code")
                    .isEqualTo("access.denied");
        }
    }

    private MvcTestResult call(Endpoint endpoint, Session session) {
        return switch (endpoint) {
            case LIST_NOTIFICATIONS -> get("/api/v1/notifications", session);
            case MARK_NOTIFICATION_READ -> post("/api/v1/notifications/" + UUID.randomUUID() + "/read", session, null);
            case MARK_ALL_READ -> post("/api/v1/notifications/read-all", session, null);
            case READ_PREFERENCES ->
                mvc.get()
                        .uri("/api/v1/me/notification-preferences")
                        .headers(session.authorization())
                        .exchange();
            case UPDATE_PREFERENCES ->
                mvc.put()
                        .uri("/api/v1/me/notification-preferences")
                        .headers(session.authorization())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"preferences\":[{\"type\":\"ISSUE_ESCALATED\",\"inApp\":true,\"email\":true}]}")
                        .exchange();
            case READ_ACTIVITY -> get("/api/v1/projects/" + projectId + "/activity", session);
            case READ_AUDIT_LOG -> get("/api/v1/audit", session);
            case VERIFY_AUDIT -> get("/api/v1/audit/verify", session);
            case READ_PROJECT_ITEM_HISTORY -> get("/api/v1/history/task/" + task, session);
            case READ_ORGANIZATION_ITEM_HISTORY -> get("/api/v1/history/portfolio/" + portfolioId, session);
            case START_UPLOAD -> startUpload(session);
            case COMPLETE_UPLOAD ->
                post(
                        "/api/v1/attachments/" + read(startUpload(contributor()), "$.attachment.id") + "/complete",
                        session,
                        null);
            case LIST_ATTACHMENTS -> get("/api/v1/attachments?ownerType=PROJECT&ownerId=" + projectId, session);
            case DOWNLOAD_ATTACHMENT -> get("/api/v1/attachments/" + available + "/download", session);
            case DELETE_ATTACHMENT ->
                mvc.delete()
                        .uri("/api/v1/attachments/{id}", read(startUpload(contributor()), "$.attachment.id"))
                        .headers(session.headers())
                        .exchange();
        };
    }

    private MvcTestResult startUpload(Session session) {
        return post("/api/v1/attachments/uploads", session, """
                {"ownerType":"PROJECT","ownerId":"%s","fileName":"Matrix.pdf","contentType":"application/pdf",
                 "sizeBytes":%d}
                """.formatted(projectId, PDF.length));
    }

    private Session contributor() {
        return sessions.get(Actor.CONTRIBUTOR);
    }

    private MvcTestResult get(String uri, Session session) {
        return mvc.get().uri(uri).headers(session.headers()).exchange();
    }

    private MvcTestResult post(String uri, Session session, String body) {
        var request = mvc.post().uri(uri).headers(session.headers());
        return body == null
                ? request.exchange()
                : request.contentType(MediaType.APPLICATION_JSON).content(body).exchange();
    }
}
