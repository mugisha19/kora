package com.kora.reports;

import static com.kora.support.Contract.conforms;
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
 * Feature 21: who may export which report, one test per actor per endpoint. Everyone exports what they can see; the
 * timesheet summary is for the project's managers, as on screen.
 */
@IntegrationTest
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ReportRoleMatrixIT {

    enum Actor {
        ORG_ADMIN,
        PMO,
        THE_MANAGER,
        CONTRIBUTOR,
        OBSERVER,
        VIEWER_AS_CONTRIBUTOR
    }

    private static final Set<Actor> MANAGERS = Set.of(Actor.ORG_ADMIN, Actor.PMO, Actor.THE_MANAGER);
    private static final Set<Actor> EVERYONE = Set.of(Actor.values());

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private final Map<Actor, Session> sessions = new EnumMap<>(Actor.class);
    private String projectId;

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
        portfolios.addToTeam(manager, projectId, sessions.get(Actor.CONTRIBUTOR).userId(), "CONTRIBUTOR");
        portfolios.addToTeam(
                manager, projectId, sessions.get(Actor.VIEWER_AS_CONTRIBUTOR).userId(), "CONTRIBUTOR");
        portfolios.addToTeam(manager, projectId, sessions.get(Actor.OBSERVER).userId(), "OBSERVER");
    }

    enum Endpoint {
        EXPORT_PROJECT_STATUS(EVERYONE, HttpStatus.ACCEPTED),
        EXPORT_EVM(EVERYONE, HttpStatus.ACCEPTED),
        EXPORT_RISK_REGISTER(EVERYONE, HttpStatus.ACCEPTED),
        EXPORT_PORTFOLIO_SUMMARY(EVERYONE, HttpStatus.ACCEPTED),
        EXPORT_TIMESHEETS(MANAGERS, HttpStatus.ACCEPTED),
        LIST_MY_REPORTS(EVERYONE, HttpStatus.OK),
        READ_A_REPORT(EVERYONE, HttpStatus.NOT_FOUND);

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
        String project = "{\"projectId\":\"%s\"}".formatted(projectId);
        return switch (endpoint) {
            case EXPORT_PROJECT_STATUS -> export(session, "PROJECT_STATUS", project);
            case EXPORT_EVM -> export(session, "EVM", project);
            case EXPORT_RISK_REGISTER -> export(session, "RISK_REGISTER", project);
            case EXPORT_PORTFOLIO_SUMMARY -> export(session, "PORTFOLIO_SUMMARY", "{}");
            case EXPORT_TIMESHEETS -> export(session, "TIMESHEETS", project);
            case LIST_MY_REPORTS ->
                mvc.get().uri("/api/v1/reports").headers(session.headers()).exchange();
            case READ_A_REPORT ->
                mvc.get()
                        .uri("/api/v1/reports/{id}", UUID.randomUUID())
                        .headers(session.headers())
                        .exchange();
        };
    }

    private MvcTestResult export(Session session, String type, String params) {
        return mvc.post()
                .uri("/api/v1/reports")
                .headers(session.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"type\":\"%s\",\"format\":\"XLSX\",\"params\":%s}".formatted(type, params))
                .exchange();
    }
}
