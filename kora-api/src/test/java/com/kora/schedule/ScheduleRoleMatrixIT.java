package com.kora.schedule;

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
 * Feature 10: who may do what with dependencies, the schedule, baselines and the calendar, one test per actor per
 * endpoint. Everyone is on the project team (or sees every project), so the answers are about permission (403).
 */
@IntegrationTest
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ScheduleRoleMatrixIT {

    enum Actor {
        ORG_ADMIN,
        PMO,
        THE_MANAGER,
        CONTRIBUTOR,
        OBSERVER
    }

    private static final Set<Actor> ADMINS = Set.of(Actor.ORG_ADMIN);
    private static final Set<Actor> MANAGERS = Set.of(Actor.ORG_ADMIN, Actor.PMO, Actor.THE_MANAGER);
    private static final Set<Actor> EVERYONE = Set.of(Actor.values());

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private final Map<Actor, Session> sessions = new EnumMap<>(Actor.class);
    private TestWork work;
    private String projectId;
    private String first;
    private String second;

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
        Session manager = sessions.get(Actor.THE_MANAGER);
        projectId = portfolios.project(manager, portfolios.portfolio(admin), "HYBRID", LocalDate.now());
        portfolios.addToTeam(manager, projectId, sessions.get(Actor.CONTRIBUTOR).userId(), "CONTRIBUTOR");
        portfolios.addToTeam(manager, projectId, sessions.get(Actor.OBSERVER).userId(), "OBSERVER");
        first = work.task(manager, projectId, "First", "");
        second = work.task(manager, projectId, "Second", "");
        assertThat(link(manager, first, second)).hasStatus(HttpStatus.CREATED);
    }

    enum Endpoint {
        READ_DEPENDENCIES(EVERYONE, HttpStatus.OK),
        READ_SCHEDULE(EVERYONE, HttpStatus.OK),
        READ_CALENDAR(EVERYONE, HttpStatus.OK),
        CREATE_DEPENDENCY(MANAGERS, HttpStatus.CONFLICT),
        DELETE_DEPENDENCY(MANAGERS, HttpStatus.NO_CONTENT),
        SAVE_BASELINE(MANAGERS, HttpStatus.CREATED),
        UPDATE_CALENDAR(ADMINS, HttpStatus.PRECONDITION_FAILED);

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
            case READ_DEPENDENCIES -> get("/api/v1/projects/" + projectId + "/dependencies", session);
            case READ_SCHEDULE -> get("/api/v1/projects/" + projectId + "/schedule", session);
            case READ_CALENDAR -> get("/api/v1/organization/calendar", session);
            case CREATE_DEPENDENCY -> link(session, first, second);
            case DELETE_DEPENDENCY -> {
                Session manager = sessions.get(Actor.THE_MANAGER);
                String from = work.task(manager, projectId, "From", "");
                String to = work.task(manager, projectId, "To", "");
                String dependency = TestPortfolios.read(link(manager, from, to), "$.id");
                yield mvc.delete()
                        .uri("/api/v1/dependencies/{id}", dependency)
                        .headers(session.headers())
                        .exchange();
            }
            case SAVE_BASELINE ->
                mvc.post()
                        .uri("/api/v1/projects/{id}/schedule/baseline", projectId)
                        .headers(session.headers())
                        .exchange();
            case UPDATE_CALENDAR ->
                mvc.put()
                        .uri("/api/v1/organization/calendar")
                        .headers(session.headers())
                        .header(HttpHeaders.IF_MATCH, "\"999\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"workingDays\":[\"MONDAY\"],\"holidays\":[]}")
                        .exchange();
        };
    }

    private MvcTestResult link(Session session, String predecessor, String successor) {
        return mvc.post()
                .uri("/api/v1/projects/{id}/dependencies", projectId)
                .headers(session.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"predecessorId\":\"%s\",\"successorId\":\"%s\"}".formatted(predecessor, successor))
                .exchange();
    }

    private MvcTestResult get(String path, Session session) {
        return mvc.get().uri(path).headers(session.headers()).exchange();
    }
}
