package com.kora.platform;

import static com.kora.support.TestPortfolios.read;
import static org.assertj.core.api.Assertions.assertThat;

import com.kora.organization.Role;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import com.kora.support.TestPortfolios;
import com.kora.support.TestWork;
import jakarta.persistence.EntityManagerFactory;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/**
 * No N+1 queries (feature 24): every list endpoint runs as many SQL statements for twelve items as for two. Two
 * organizations of the same shape, one small and one large, are read the same way and their statement counts
 * compared, so a per-row lookup (a name, a project, a count) shows up as a difference.
 */
@IntegrationTest
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class QueryCountIT {

    private static final int SMALL = 2;
    private static final int LARGE = 12;

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    private Tenant small;
    private Tenant large;

    /** An organization with {@code size} projects, members and items of every kind in its first project. */
    private record Tenant(Session manager, Session admin, String projectId) {}

    @BeforeAll
    void createTwoOrganizationsOfDifferentSizes() {
        small = tenant(SMALL);
        large = tenant(LARGE);
    }

    static Stream<String> listEndpoints() {
        return Stream.of(
                "/api/v1/projects",
                "/api/v1/dashboard/projects",
                "/api/v1/members",
                "/api/v1/risks?minScore=1",
                "/api/v1/projects/{project}/tasks",
                "/api/v1/projects/{project}/board",
                "/api/v1/projects/{project}/backlog",
                "/api/v1/projects/{project}/risks",
                "/api/v1/projects/{project}/issues",
                "/api/v1/projects/{project}/stakeholders",
                "/api/v1/projects/{project}/change-requests",
                "/api/v1/projects/{project}/members",
                "/api/v1/projects/{project}/wbs",
                "/api/v1/projects/{project}/schedule",
                "/api/v1/projects/{project}/activity",
                "/api/v1/notifications",
                "/api/v1/audit");
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("listEndpoints")
    void readingTwelveItemsCostsNoMoreQueriesThanReadingTwo(String endpoint) {
        long forSmall = statements(small, endpoint);
        long forLarge = statements(large, endpoint);

        assertThat(forLarge)
                .as("SQL statements for %d items (%d for %d items)", LARGE, forSmall, SMALL)
                .isLessThanOrEqualTo(forSmall);
    }

    /** The fewest statements of three reads: a background job or listener can add some to one read, never remove. */
    private long statements(Tenant tenant, String endpoint) {
        String uri = endpoint.replace("{project}", tenant.projectId());
        Statistics statistics =
                entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
        long fewest = Long.MAX_VALUE;
        for (int attempt = 0; attempt < 3; attempt++) {
            statistics.clear();
            Session reader = uri.startsWith("/api/v1/audit") ? tenant.admin() : tenant.manager();
            MvcTestResult result = mvc.get().uri(uri).headers(reader.headers()).exchange();
            assertThat(result).as(uri).hasStatusOk();
            fewest = Math.min(fewest, statistics.getPrepareStatementCount());
        }
        return fewest;
    }

    private Tenant tenant(int size) {
        TestAccounts accounts = new TestAccounts(mvc, emails);
        TestPortfolios portfolios = new TestPortfolios(mvc);
        TestWork work = new TestWork(mvc);
        Session admin = accounts.registerOrganization();
        Session manager = accounts.join(admin, Role.PROJECT_MANAGER);
        String portfolio = portfolios.portfolio(admin);
        // The measured project is hybrid, so it has a schedule (dependencies) as well as a board.
        String project = read(
                portfolios.createProject(
                        manager,
                        portfolio,
                        TestPortfolios.code(),
                        LocalDate.now(),
                        LocalDate.now().plusMonths(6),
                        "100000",
                        "HYBRID"),
                "$.id");
        for (int i = 1; i < size; i++) {
            portfolios.project(manager, portfolio);
        }
        List<Session> team = new ArrayList<>();
        for (int i = 0; i < size; i++) {
            Session member = accounts.join(admin, Role.MEMBER);
            portfolios.addToTeam(manager, project, member.userId(), "CONTRIBUTOR");
            team.add(member);
        }
        String workPackage = read(
                post(
                        manager,
                        "/api/v1/projects/" + project + "/wbs/nodes",
                        "{\"name\":\"Build\",\"type\":\"WORK_PACKAGE\",\"plannedEffortHours\":100,\"plannedCost\":\"1000\"}"),
                "$.id");
        String previous = null;
        for (int i = 0; i < size; i++) {
            Session owner = team.get(i);
            String task = work.task(
                    manager,
                    project,
                    "Task " + i,
                    ",\"assigneeId\":\"%s\",\"wbsNodeId\":\"%s\",".formatted(owner.userId(), workPackage)
                            + "\"labels\":[\"api\"],\"durationDays\":2");
            if (previous != null) {
                post(
                        manager,
                        "/api/v1/projects/" + project + "/dependencies",
                        "{\"predecessorId\":\"%s\",\"successorId\":\"%s\"}".formatted(previous, task));
            }
            previous = task;
            post(manager, "/api/v1/projects/" + project + "/risks", """
                    {"title":"Risk %d","kind":"THREAT","category":"EXTERNAL","probability":4,"impact":4,"ownerId":"%s"}
                    """.formatted(i, owner.userId()));
            post(manager, "/api/v1/projects/" + project + "/issues", """
                    {"title":"Issue %d","type":"OTHER","priority":"HIGH","ownerId":"%s"}
                    """.formatted(i, owner.userId()));
            post(manager, "/api/v1/projects/" + project + "/stakeholders", """
                    {"name":"Stakeholder %d","power":3,"interest":3,"currentEngagement":"NEUTRAL",
                     "desiredEngagement":"SUPPORTIVE","userId":"%s"}
                    """.formatted(i, owner.userId()));
            String change =
                    read(post(owner, "/api/v1/projects/" + project + "/change-requests", """
                    {"title":"Change %d","type":"SCOPE","reason":"Asked","impact":{"scheduleDeltaDays":0}}
                    """.formatted(i)), "$.id");
            // Submitted: each one asks the manager for approval, so the manager's notifications grow too.
            assertThat(mvc.post()
                            .uri("/api/v1/change-requests/{id}/submit", change)
                            .headers(owner.headers())
                            .exchange())
                    .hasStatusOk();
        }
        return new Tenant(manager, admin, project);
    }

    private MvcTestResult post(Session session, String uri, String body) {
        MvcTestResult result = mvc.post()
                .uri(uri)
                .headers(session.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .exchange();
        assertThat(result).as(uri).hasStatus(HttpStatus.CREATED);
        return result;
    }
}
