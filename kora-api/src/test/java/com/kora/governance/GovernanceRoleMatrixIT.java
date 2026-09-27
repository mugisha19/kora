package com.kora.governance;

import static com.kora.support.Contract.conforms;
import static com.kora.support.TestPortfolios.read;
import static org.assertj.core.api.Assertions.assertThat;

import com.kora.organization.Role;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import com.kora.support.TestPortfolios;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/**
 * Features 11–14: who may do what with risks, issues, stakeholders and change requests, one test per actor per
 * endpoint. Nobody owns the targets, so the "owner" path is left to {@code RiskIT} and {@code IssueIT}; allowed
 * callers aim at harmless targets (a stale version, an illegal move) where they can. Decisions depend on the step
 * and are covered in {@code ChangeRequestIT}.
 */
@IntegrationTest
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class GovernanceRoleMatrixIT {

    enum Actor {
        ORG_ADMIN,
        PMO,
        THE_MANAGER,
        CONTRIBUTOR,
        OBSERVER,
        VIEWER_AS_CONTRIBUTOR
    }

    private static final Set<Actor> ADMINS = Set.of(Actor.ORG_ADMIN);
    private static final Set<Actor> MANAGERS = Set.of(Actor.ORG_ADMIN, Actor.PMO, Actor.THE_MANAGER);
    private static final Set<Actor> WORKERS = Set.of(Actor.ORG_ADMIN, Actor.PMO, Actor.THE_MANAGER, Actor.CONTRIBUTOR);
    private static final Set<Actor> EVERYONE = Set.of(Actor.values());

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private final Map<Actor, Session> sessions = new EnumMap<>(Actor.class);
    private String projectId;
    private String openRisk;
    private String closedRisk;
    private String openIssue;
    private String resolvedIssue;
    private String stakeholder;
    private String draftRequest;
    private String submittedRequest;
    private String approvedRequest;

    @BeforeAll
    void createTheCast() {
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
        Session contributor = sessions.get(Actor.CONTRIBUTOR);
        projectId = portfolios.project(manager, portfolios.portfolio(admin));
        portfolios.addToTeam(manager, projectId, contributor.userId(), "CONTRIBUTOR");
        portfolios.addToTeam(
                manager, projectId, sessions.get(Actor.VIEWER_AS_CONTRIBUTOR).userId(), "CONTRIBUTOR");
        portfolios.addToTeam(manager, projectId, sessions.get(Actor.OBSERVER).userId(), "OBSERVER");

        openRisk = read(raiseRisk(manager), "$.id");
        closedRisk = read(raiseRisk(manager), "$.id");
        ok(post("/api/v1/risks/" + closedRisk + "/close", manager, "{\"note\":\"Gone\"}"));
        openIssue = read(raiseIssue(manager), "$.id");
        resolvedIssue = read(raiseIssue(manager), "$.id");
        ok(post("/api/v1/issues/" + resolvedIssue + "/resolve", manager, "{\"resolution\":\"Fixed\"}"));
        stakeholder = read(addStakeholder(manager), "$.id");
        draftRequest = read(draft(manager), "$.id");
        submittedRequest = read(draft(manager), "$.id");
        ok(post("/api/v1/change-requests/" + submittedRequest + "/submit", manager, ""));
        // Requested by the manager, so the PMO decides; a requester may withdraw, so no contributor is the requester.
        approvedRequest = read(draft(manager), "$.id");
        ok(post("/api/v1/change-requests/" + approvedRequest + "/submit", manager, ""));
        ok(post(
                "/api/v1/change-requests/" + approvedRequest + "/decisions",
                sessions.get(Actor.PMO),
                "{\"decision\":\"APPROVE\"}"));
    }

    enum Endpoint {
        READ_RISKS(EVERYONE, HttpStatus.OK),
        READ_HEATMAP(EVERYONE, HttpStatus.OK),
        READ_PORTFOLIO_RISKS(EVERYONE, HttpStatus.OK),
        RAISE_RISK(WORKERS, HttpStatus.CREATED),
        UPDATE_RISK(MANAGERS, HttpStatus.PRECONDITION_FAILED),
        ASSESS_RISK(MANAGERS, HttpStatus.CREATED),
        CLOSE_RISK(MANAGERS, HttpStatus.CONFLICT),
        MATERIALIZE_RISK(MANAGERS, HttpStatus.CONFLICT),
        READ_ISSUES(EVERYONE, HttpStatus.OK),
        RAISE_ISSUE(WORKERS, HttpStatus.CREATED),
        UPDATE_ISSUE(MANAGERS, HttpStatus.PRECONDITION_FAILED),
        RESOLVE_ISSUE(MANAGERS, HttpStatus.CONFLICT),
        CLOSE_ISSUE(MANAGERS, HttpStatus.CONFLICT),
        REOPEN_ISSUE(MANAGERS, HttpStatus.CONFLICT),
        READ_STAKEHOLDERS(EVERYONE, HttpStatus.OK),
        READ_GRID(EVERYONE, HttpStatus.OK),
        ADD_STAKEHOLDER(MANAGERS, HttpStatus.CREATED),
        UPDATE_STAKEHOLDER(MANAGERS, HttpStatus.PRECONDITION_FAILED),
        REMOVE_STAKEHOLDER(MANAGERS, HttpStatus.NO_CONTENT),
        READ_CHANGE_REQUESTS(EVERYONE, HttpStatus.OK),
        READ_APPROVAL_INBOX(EVERYONE, HttpStatus.OK),
        DRAFT_CHANGE_REQUEST(WORKERS, HttpStatus.CREATED),
        EDIT_CHANGE_REQUEST(MANAGERS, HttpStatus.PRECONDITION_FAILED),
        SUBMIT_CHANGE_REQUEST(MANAGERS, HttpStatus.CONFLICT),
        WITHDRAW_CHANGE_REQUEST(MANAGERS, HttpStatus.CONFLICT),
        IMPLEMENT_CHANGE_REQUEST(MANAGERS, HttpStatus.CONFLICT),
        REVISE_CHANGE_REQUEST(MANAGERS, HttpStatus.CONFLICT),
        READ_CHANGE_CONTROL(EVERYONE, HttpStatus.OK),
        UPDATE_CHANGE_CONTROL(ADMINS, HttpStatus.PRECONDITION_FAILED);

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
        String project = "/api/v1/projects/" + projectId;
        return switch (endpoint) {
            case READ_RISKS -> get(project + "/risks", session);
            case READ_HEATMAP -> get(project + "/risks/heatmap", session);
            case READ_PORTFOLIO_RISKS -> get("/api/v1/risks", session);
            case RAISE_RISK -> raiseRisk(session);
            case UPDATE_RISK -> stale("/api/v1/risks/" + openRisk, session, "{\"title\":\"Renamed\"}");
            case ASSESS_RISK ->
                post("/api/v1/risks/" + openRisk + "/assessments", session, "{\"probability\":2,\"impact\":2}");
            case CLOSE_RISK -> post("/api/v1/risks/" + closedRisk + "/close", session, "{\"note\":\"Again\"}");
            case MATERIALIZE_RISK -> post("/api/v1/risks/" + closedRisk + "/materialize", session, "{}");
            case READ_ISSUES -> get(project + "/issues", session);
            case RAISE_ISSUE -> raiseIssue(session);
            case UPDATE_ISSUE -> stale("/api/v1/issues/" + openIssue, session, "{\"title\":\"Renamed\"}");
            case RESOLVE_ISSUE ->
                post("/api/v1/issues/" + resolvedIssue + "/resolve", session, "{\"resolution\":\"Again\"}");
            case CLOSE_ISSUE -> post("/api/v1/issues/" + openIssue + "/close", session, "");
            case REOPEN_ISSUE -> post("/api/v1/issues/" + openIssue + "/reopen", session, "{\"reason\":\"Back\"}");
            case READ_STAKEHOLDERS -> get(project + "/stakeholders", session);
            case READ_GRID -> get(project + "/stakeholders/grid", session);
            case ADD_STAKEHOLDER -> addStakeholder(session);
            case UPDATE_STAKEHOLDER -> stale("/api/v1/stakeholders/" + stakeholder, session, "{\"name\":\"Renamed\"}");
            case REMOVE_STAKEHOLDER -> {
                String target = read(addStakeholder(sessions.get(Actor.THE_MANAGER)), "$.id");
                yield mvc.delete()
                        .uri("/api/v1/stakeholders/{id}", target)
                        .headers(session.headers())
                        .exchange();
            }
            case READ_CHANGE_REQUESTS -> get(project + "/change-requests", session);
            case READ_APPROVAL_INBOX -> get("/api/v1/approvals/pending", session);
            case DRAFT_CHANGE_REQUEST -> draft(session);
            case EDIT_CHANGE_REQUEST ->
                stale("/api/v1/change-requests/" + draftRequest, session, "{\"title\":\"Renamed\"}");
            case SUBMIT_CHANGE_REQUEST -> post("/api/v1/change-requests/" + submittedRequest + "/submit", session, "");
            case WITHDRAW_CHANGE_REQUEST ->
                post("/api/v1/change-requests/" + approvedRequest + "/withdraw", session, "");
            case IMPLEMENT_CHANGE_REQUEST ->
                post("/api/v1/change-requests/" + draftRequest + "/implement", session, "");
            case REVISE_CHANGE_REQUEST -> post("/api/v1/change-requests/" + draftRequest + "/revise", session, "");
            case READ_CHANGE_CONTROL -> get("/api/v1/organization/change-control", session);
            case UPDATE_CHANGE_CONTROL ->
                mvc.put()
                        .uri("/api/v1/organization/change-control")
                        .headers(session.headers())
                        .header(HttpHeaders.IF_MATCH, "\"999\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"pmoCostPercent\":5,\"pmoScheduleDays\":10,\"sponsorCostPercent\":15}")
                        .exchange();
        };
    }

    private MvcTestResult raiseRisk(Session session) {
        return post("/api/v1/projects/" + projectId + "/risks", session, """
                {"title":"Matrix risk","kind":"THREAT","category":"OTHER","probability":2,"impact":2}
                """);
    }

    private MvcTestResult raiseIssue(Session session) {
        return post("/api/v1/projects/" + projectId + "/issues", session, """
                {"title":"Matrix issue","type":"OTHER","priority":"LOW"}
                """);
    }

    private MvcTestResult addStakeholder(Session session) {
        return post("/api/v1/projects/" + projectId + "/stakeholders", session, """
                {"name":"Matrix","power":2,"interest":2,"currentEngagement":"NEUTRAL","desiredEngagement":"NEUTRAL"}
                """);
    }

    private MvcTestResult draft(Session session) {
        return post("/api/v1/projects/" + projectId + "/change-requests", session, """
                {"title":"Matrix change","type":"OTHER","reason":"Testing"}
                """);
    }

    private MvcTestResult stale(String uri, Session session, String body) {
        return mvc.patch()
                .uri(uri)
                .headers(session.headers())
                .header(HttpHeaders.IF_MATCH, "\"999\"")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .exchange();
    }

    private void ok(MvcTestResult result) {
        assertThat(result).hasStatusOk();
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
