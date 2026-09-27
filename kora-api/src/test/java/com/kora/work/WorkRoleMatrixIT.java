package com.kora.work;

import static com.kora.support.Contract.conforms;
import static org.assertj.core.api.Assertions.assertThat;

import com.kora.organization.Role;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import com.kora.support.TestPortfolios;
import com.kora.support.TestWork;
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
 * Features 08–09: who may do what with tasks, the board and sprints, one test per actor per endpoint. Everyone is on the
 * project team (or sees every project), so the answers are about permission (403), not visibility (404). Allowed
 * callers aim at harmless targets (a stale version, an illegal move, a closed sprint) where they can.
 */
@IntegrationTest
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class WorkRoleMatrixIT {

    /** Project roles on top of organization roles: a {@code VIEWER} stays read-only even as a contributor. */
    enum Actor {
        ORG_ADMIN,
        PMO,
        THE_MANAGER,
        CONTRIBUTOR,
        OBSERVER,
        VIEWER_AS_CONTRIBUTOR
    }

    private static final Set<Actor> MANAGERS = Set.of(Actor.ORG_ADMIN, Actor.PMO, Actor.THE_MANAGER);
    private static final Set<Actor> WORKERS = Set.of(Actor.ORG_ADMIN, Actor.PMO, Actor.THE_MANAGER, Actor.CONTRIBUTOR);
    private static final Set<Actor> EVERYONE = Set.of(Actor.values());

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private final Map<Actor, Session> sessions = new EnumMap<>(Actor.class);
    private TestWork work;
    private String projectId;
    private String sharedTask;
    private String closedSprint;

    @BeforeAll
    void createTheCast() {
        TestAccounts accounts = new TestAccounts(mvc, emails);
        TestPortfolios portfolios = new TestPortfolios(mvc);
        work = new TestWork(mvc);
        Session admin = accounts.registerOrganization();
        sessions.put(Actor.ORG_ADMIN, admin);
        sessions.put(Actor.PMO, accounts.join(admin, Role.PMO));
        sessions.put(Actor.THE_MANAGER, accounts.join(admin, Role.PROJECT_MANAGER));
        sessions.put(Actor.CONTRIBUTOR, accounts.join(admin, Role.MEMBER));
        sessions.put(Actor.OBSERVER, accounts.join(admin, Role.MEMBER));
        sessions.put(Actor.VIEWER_AS_CONTRIBUTOR, accounts.join(admin, Role.VIEWER));
        Session manager = sessions.get(Actor.THE_MANAGER);
        projectId = portfolios.project(manager, portfolios.portfolio(admin));
        for (Actor actor : new Actor[] {Actor.CONTRIBUTOR, Actor.VIEWER_AS_CONTRIBUTOR}) {
            portfolios.addToTeam(manager, projectId, sessions.get(actor).userId(), "CONTRIBUTOR");
        }
        portfolios.addToTeam(manager, projectId, sessions.get(Actor.OBSERVER).userId(), "OBSERVER");
        sharedTask = work.task(manager, projectId, "Shared", "");
        closedSprint = work.sprint(
                manager, projectId, "Done", LocalDate.now(), LocalDate.now().plusDays(6));
        work.start(manager, closedSprint);
        work.close(manager, closedSprint, "BACKLOG");
    }

    enum Endpoint {
        READ_TASKS(EVERYONE, HttpStatus.OK),
        READ_BOARD(EVERYONE, HttpStatus.OK),
        READ_BACKLOG(EVERYONE, HttpStatus.OK),
        READ_VELOCITY(EVERYONE, HttpStatus.OK),
        CREATE_TASK(WORKERS, HttpStatus.CREATED),
        UPDATE_TASK(WORKERS, HttpStatus.PRECONDITION_FAILED),
        MOVE_TASK(WORKERS, HttpStatus.CONFLICT),
        COMMENT(WORKERS, HttpStatus.CREATED),
        DELETE_TASK(MANAGERS, HttpStatus.NO_CONTENT),
        CONFIGURE_COLUMN(MANAGERS, HttpStatus.OK),
        CREATE_SPRINT(MANAGERS, HttpStatus.CREATED),
        START_SPRINT(MANAGERS, HttpStatus.CONFLICT),
        PLAN_SPRINT(MANAGERS, HttpStatus.CONFLICT);

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
            case READ_TASKS -> get("/api/v1/projects/" + projectId + "/tasks", session);
            case READ_BOARD -> get("/api/v1/projects/" + projectId + "/board", session);
            case READ_BACKLOG -> get("/api/v1/projects/" + projectId + "/backlog", session);
            case READ_VELOCITY -> get("/api/v1/projects/" + projectId + "/velocity", session);
            case CREATE_TASK -> work.createTask(session, projectId, "Matrix", "");
            case UPDATE_TASK ->
                mvc.patch()
                        .uri("/api/v1/tasks/{id}", sharedTask)
                        .headers(session.headers())
                        .header(HttpHeaders.IF_MATCH, "\"999\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Renamed\"}")
                        .exchange();
            case MOVE_TASK -> work.moveTo(session, sharedTask, "DONE");
            case COMMENT -> post("/api/v1/tasks/" + sharedTask + "/comments", session, "{\"body\":\"Matrix\"}");
            case DELETE_TASK -> {
                String task = work.task(sessions.get(Actor.THE_MANAGER), projectId, "Doomed", "");
                yield mvc.delete()
                        .uri("/api/v1/tasks/{id}", task)
                        .headers(session.headers())
                        .exchange();
            }
            case CONFIGURE_COLUMN ->
                mvc.put()
                        .uri("/api/v1/projects/{id}/board/columns/DONE", projectId)
                        .headers(session.headers())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"DONE\",\"name\":\"Shipped\"}")
                        .exchange();
            case CREATE_SPRINT ->
                post(
                        "/api/v1/projects/" + projectId + "/sprints",
                        session,
                        "{\"name\":\"Matrix\",\"startDate\":\"%s\",\"endDate\":\"%s\"}"
                                .formatted(
                                        LocalDate.now().plusDays(30),
                                        LocalDate.now().plusDays(43)));
            case START_SPRINT -> post("/api/v1/sprints/" + closedSprint + "/start", session, "");
            case PLAN_SPRINT ->
                post(
                        "/api/v1/sprints/" + closedSprint + "/tasks",
                        session,
                        "{\"taskIds\":[\"%s\"]}".formatted(sharedTask));
        };
    }

    private MvcTestResult get(String path, Session session) {
        return mvc.get().uri(path).headers(session.headers()).exchange();
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
