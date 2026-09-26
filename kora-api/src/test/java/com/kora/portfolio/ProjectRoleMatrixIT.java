package com.kora.portfolio;

import static com.kora.support.Contract.conforms;
import static org.assertj.core.api.Assertions.assertThat;

import com.kora.organization.Role;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import com.kora.support.TestPortfolios;
import java.time.LocalDate;
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
 * Feature 04: who may do what with portfolios and projects, one test per actor per endpoint. Everyone is on the
 * project team, so the answers are about permission (403), not visibility (404). Allowed callers aim at harmless
 * targets (a stale version, an illegal move) and get 409/412 instead of changing anything.
 */
@IntegrationTest
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ProjectRoleMatrixIT {

    /** The project's own manager is an actor of its own: a project manager, but only of this project. */
    enum Actor {
        ORG_ADMIN,
        PMO,
        THE_MANAGER,
        OTHER_PROJECT_MANAGER,
        MEMBER,
        VIEWER
    }

    private static final Set<Actor> GOVERNORS = Set.of(Actor.ORG_ADMIN, Actor.PMO);
    private static final Set<Actor> MANAGERS = Set.of(Actor.ORG_ADMIN, Actor.PMO, Actor.THE_MANAGER);
    private static final Set<Actor> PROJECT_CREATORS =
            Set.of(Actor.ORG_ADMIN, Actor.PMO, Actor.THE_MANAGER, Actor.OTHER_PROJECT_MANAGER);
    private static final Set<Actor> EVERYONE = Set.of(Actor.values());

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private final Map<Actor, Session> sessions = new EnumMap<>(Actor.class);
    private String portfolioId;
    private String projectId;

    @BeforeAll
    void createTheCast() {
        TestAccounts accounts = new TestAccounts(mvc, emails);
        TestPortfolios portfolios = new TestPortfolios(mvc);
        Session admin = accounts.registerOrganization();
        sessions.put(Actor.ORG_ADMIN, admin);
        sessions.put(Actor.PMO, accounts.join(admin, Role.PMO));
        sessions.put(Actor.THE_MANAGER, accounts.join(admin, Role.PROJECT_MANAGER));
        sessions.put(Actor.OTHER_PROJECT_MANAGER, accounts.join(admin, Role.PROJECT_MANAGER));
        sessions.put(Actor.MEMBER, accounts.join(admin, Role.MEMBER));
        sessions.put(Actor.VIEWER, accounts.join(admin, Role.VIEWER));
        portfolioId = portfolios.portfolio(admin);
        projectId = portfolios.project(sessions.get(Actor.THE_MANAGER), portfolioId);
        for (Actor actor : new Actor[] {Actor.OTHER_PROJECT_MANAGER, Actor.MEMBER, Actor.VIEWER, Actor.PMO}) {
            portfolios.addToTeam(
                    sessions.get(Actor.THE_MANAGER),
                    projectId,
                    sessions.get(actor).userId(),
                    "OBSERVER");
        }
    }

    enum Endpoint {
        CREATE_PORTFOLIO(GOVERNORS, HttpStatus.CREATED),
        CREATE_PROJECT(PROJECT_CREATORS, HttpStatus.CREATED),
        READ_PROJECT(EVERYONE, HttpStatus.OK),
        UPDATE_PROJECT(MANAGERS, HttpStatus.PRECONDITION_FAILED),
        TRANSITION_PROJECT(MANAGERS, HttpStatus.CONFLICT),
        EDIT_TEAM(MANAGERS, HttpStatus.CONFLICT),
        EDIT_CHARTER(MANAGERS, HttpStatus.PRECONDITION_FAILED),
        APPROVE_CHARTER(GOVERNORS, HttpStatus.CONFLICT),
        EDIT_WBS(MANAGERS, HttpStatus.CREATED),
        READ_DASHBOARD(EVERYONE, HttpStatus.OK);

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
            case CREATE_PORTFOLIO -> post("/api/v1/portfolios", session, "{\"name\":\"Matrix portfolio\"}");
            case CREATE_PROJECT ->
                post("/api/v1/projects", session, """
                    {"code":"%s","name":"Matrix","portfolioId":"%s","methodology":"HYBRID",
                     "startDate":"%s","targetEndDate":"%s"}
                    """.formatted(
                                TestPortfolios.code(),
                                portfolioId,
                                LocalDate.now(),
                                LocalDate.now().plusDays(90)));
            case READ_PROJECT ->
                mvc.get()
                        .uri("/api/v1/projects/{id}", projectId)
                        .headers(session.headers())
                        .exchange();
            case UPDATE_PROJECT ->
                mvc.patch()
                        .uri("/api/v1/projects/{id}", projectId)
                        .headers(session.headers())
                        .header(HttpHeaders.IF_MATCH, "\"999\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Renamed\"}")
                        .exchange();
            case TRANSITION_PROJECT ->
                post("/api/v1/projects/" + projectId + "/transitions", session, "{\"to\":\"CLOSED\"}");
            case EDIT_TEAM ->
                mvc.delete()
                        .uri(
                                "/api/v1/projects/{id}/members/{userId}",
                                projectId,
                                sessions.get(Actor.THE_MANAGER).userId())
                        .headers(session.headers())
                        .exchange();
            case EDIT_CHARTER ->
                mvc.put()
                        .uri("/api/v1/projects/{id}/charter", projectId)
                        .headers(session.headers())
                        .header(HttpHeaders.IF_MATCH, "\"999\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purpose\":\"Matrix\"}")
                        .exchange();
            case APPROVE_CHARTER ->
                mvc.post()
                        .uri("/api/v1/projects/{id}/charter/approve", projectId)
                        .headers(session.headers())
                        .exchange();
            case EDIT_WBS ->
                post(
                        "/api/v1/projects/" + projectId + "/wbs/nodes",
                        session,
                        "{\"name\":\"Matrix\",\"type\":\"DELIVERABLE\"}");
            case READ_DASHBOARD ->
                mvc.get()
                        .uri("/api/v1/dashboard/summary")
                        .headers(session.headers())
                        .exchange();
        };
    }

    private MvcTestResult post(String path, Session session, String body) {
        return mvc.post()
                .uri(path)
                .headers(session.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .exchange();
    }
}
