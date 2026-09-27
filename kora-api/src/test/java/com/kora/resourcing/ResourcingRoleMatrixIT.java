package com.kora.resourcing;

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
 * Features 15–17: who may do what with timesheets, cost rates, capacity, allocations and earned value, one test per
 * actor per endpoint. The contributor owns the timesheet and capacity used as targets.
 */
@IntegrationTest
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ResourcingRoleMatrixIT {

    enum Actor {
        ORG_ADMIN,
        PMO,
        THE_MANAGER,
        CONTRIBUTOR,
        OBSERVER,
        VIEWER_AS_CONTRIBUTOR
    }

    private static final String WEEK = "2026-W50";
    private static final Set<Actor> ADMINS = Set.of(Actor.ORG_ADMIN);
    private static final Set<Actor> RATE_KEEPERS = Set.of(Actor.ORG_ADMIN, Actor.PMO);
    private static final Set<Actor> MANAGERS = Set.of(Actor.ORG_ADMIN, Actor.PMO, Actor.THE_MANAGER);
    private static final Set<Actor> WORKERS = Set.of(Actor.ORG_ADMIN, Actor.PMO, Actor.THE_MANAGER, Actor.CONTRIBUTOR);
    private static final Set<Actor> OWNER_AND_MANAGERS = WORKERS;
    private static final Set<Actor> OWNER_AND_RATE_KEEPERS = Set.of(Actor.ORG_ADMIN, Actor.PMO, Actor.CONTRIBUTOR);
    private static final Set<Actor> EVERYONE = Set.of(Actor.values());

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private final Map<Actor, Session> sessions = new EnumMap<>(Actor.class);
    private String projectId;
    private String task;
    private String sheet;

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
        projectId = portfolios.project(manager, portfolios.portfolio(admin));
        portfolios.addToTeam(manager, projectId, contributor().userId(), "CONTRIBUTOR");
        portfolios.addToTeam(
                manager, projectId, sessions.get(Actor.VIEWER_AS_CONTRIBUTOR).userId(), "CONTRIBUTOR");
        portfolios.addToTeam(manager, projectId, sessions.get(Actor.OBSERVER).userId(), "OBSERVER");
        task = new TestWork(mvc).task(manager, projectId, "Matrix", "");
        assertThat(logTime(contributor())).hasStatusOk();
        sheet = read(get("/api/v1/timesheets/me?week=" + WEEK, contributor()), "$.sheets[0].id");
    }

    enum Endpoint {
        READ_MY_WEEK(EVERYONE, HttpStatus.OK),
        LOG_TIME(WORKERS, HttpStatus.OK),
        LIST_PROJECT_TIMESHEETS(MANAGERS, HttpStatus.OK),
        READ_TIMESHEET(OWNER_AND_MANAGERS, HttpStatus.OK),
        APPROVE_TIMESHEET(MANAGERS, HttpStatus.CONFLICT),
        REJECT_TIMESHEET(MANAGERS, HttpStatus.CONFLICT),
        READ_COST_RATES(RATE_KEEPERS, HttpStatus.OK),
        ADD_COST_RATE(RATE_KEEPERS, HttpStatus.CREATED),
        READ_HEATMAP(EVERYONE, HttpStatus.OK),
        READ_ALLOCATIONS(EVERYONE, HttpStatus.OK),
        SAVE_ALLOCATIONS(MANAGERS, HttpStatus.OK),
        READ_CAPACITY(OWNER_AND_MANAGERS, HttpStatus.OK),
        CHANGE_CAPACITY(RATE_KEEPERS, HttpStatus.OK),
        ADD_LEAVE(OWNER_AND_RATE_KEEPERS, HttpStatus.CREATED),
        READ_EVM(EVERYONE, HttpStatus.OK),
        READ_EVM_SERIES(EVERYONE, HttpStatus.OK),
        READ_EVM_SETTINGS(EVERYONE, HttpStatus.OK),
        UPDATE_EVM_SETTINGS(MANAGERS, HttpStatus.PRECONDITION_FAILED),
        READ_TRENDS(EVERYONE, HttpStatus.OK),
        ADD_PUBLIC_HOLIDAYS(ADMINS, HttpStatus.PRECONDITION_FAILED);

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
        String person = "/api/v1/users/" + contributor().userId();
        return switch (endpoint) {
            case READ_MY_WEEK -> get("/api/v1/timesheets/me", session);
            case LOG_TIME -> logTime(session);
            case LIST_PROJECT_TIMESHEETS -> get(project + "/timesheets", session);
            case READ_TIMESHEET -> get("/api/v1/timesheets/" + sheet, session);
            case APPROVE_TIMESHEET -> post("/api/v1/timesheets/" + sheet + "/approve", session, "");
            case REJECT_TIMESHEET ->
                post("/api/v1/timesheets/" + sheet + "/reject", session, "{\"comment\":\"Matrix\"}");
            case READ_COST_RATES -> get(person + "/cost-rates", session);
            case ADD_COST_RATE ->
                post(
                        person + "/cost-rates",
                        session,
                        "{\"hourlyRate\":{\"amount\":\"1000\",\"currency\":\"RWF\"},\"validFrom\":\"2026-01-01\"}");
            case READ_HEATMAP -> get("/api/v1/resources/heatmap", session);
            case READ_ALLOCATIONS -> get(project + "/allocations", session);
            case SAVE_ALLOCATIONS ->
                put(
                        project + "/allocations",
                        session,
                        null,
                        "{\"allocations\":[{\"userId\":\"%s\",\"weekStart\":\"2026-12-07\",\"hours\":8}]}"
                                .formatted(contributor().userId()));
            case READ_CAPACITY -> get(person + "/capacity", session);
            case CHANGE_CAPACITY ->
                put(person + "/capacity", session, null, "{\"hoursPerWeek\":40,\"validFrom\":\"2026-01-01\"}");
            case ADD_LEAVE -> post(person + "/leave", session, "{\"from\":\"2026-12-14\",\"to\":\"2026-12-14\"}");
            case READ_EVM -> get(project + "/evm", session);
            case READ_EVM_SERIES -> get(project + "/evm/series", session);
            case READ_EVM_SETTINGS -> get(project + "/evm/settings", session);
            case UPDATE_EVM_SETTINGS ->
                put(
                        project + "/evm/settings",
                        session,
                        "\"999\"",
                        "{\"percentCompleteMethod\":\"PHYSICAL\",\"eacMethod\":\"TYPICAL\"}");
            case READ_TRENDS -> get("/api/v1/dashboard/trends", session);
            case ADD_PUBLIC_HOLIDAYS ->
                mvc.post()
                        .uri("/api/v1/organization/calendar/public-holidays")
                        .headers(session.headers())
                        .header(HttpHeaders.IF_MATCH, "\"999\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"country\":\"RW\",\"year\":2026}")
                        .exchange();
        };
    }

    private Session contributor() {
        return sessions.get(Actor.CONTRIBUTOR);
    }

    private MvcTestResult logTime(Session session) {
        return put(
                "/api/v1/timesheets/me/" + WEEK + "/entries",
                session,
                null,
                "{\"entries\":[{\"taskId\":\"%s\",\"date\":\"2026-12-08\",\"hours\":2}]}".formatted(task));
    }

    private MvcTestResult put(String uri, Session session, String ifMatch, String body) {
        var request = mvc.put()
                .uri(uri)
                .headers(session.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body);
        if (ifMatch != null) {
            request = request.header(HttpHeaders.IF_MATCH, ifMatch);
        }
        return request.exchange();
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
