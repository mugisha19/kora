package com.kora.work;

import static com.kora.support.Contract.conforms;
import static com.kora.support.TestPortfolios.etag;
import static com.kora.support.TestPortfolios.read;
import static org.assertj.core.api.Assertions.assertThat;

import com.kora.organization.Role;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import com.kora.support.TestPortfolios;
import com.kora.support.TestWork;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/** Feature 09: the backlog, the sprint lifecycle with carry-over, burndown and velocity. */
@IntegrationTest
class SprintIT {

    /** The organization's today: registration defaults to Kigali. */
    private static final ZoneId KIGALI = ZoneId.of("Africa/Kigali");

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private TestPortfolios portfolios;
    private TestWork work;
    private Session admin;
    private Session manager;
    private String portfolioId;
    private String projectId;
    private LocalDate today;

    @BeforeEach
    void setUp() {
        TestAccounts accounts = new TestAccounts(mvc, emails);
        portfolios = new TestPortfolios(mvc);
        work = new TestWork(mvc);
        admin = accounts.registerOrganization();
        manager = accounts.join(admin, Role.PROJECT_MANAGER);
        portfolioId = portfolios.portfolio(admin);
        projectId = portfolios.project(manager, portfolioId);
        today = LocalDate.now(KIGALI);
    }

    @Test
    void aSprintFreezesItsCommitmentAndCarriesUnfinishedWorkOver() {
        String sprint = work.sprint(manager, projectId, "Sprint 1", today, today.plusDays(13));
        String next = work.sprint(manager, projectId, "Sprint 2", today.plusDays(14), today.plusDays(27));
        String small = work.task(manager, projectId, "Small", ",\"storyPoints\":3");
        String medium = work.task(manager, projectId, "Medium", ",\"storyPoints\":5");
        String large = work.task(manager, projectId, "Large", ",\"storyPoints\":8");
        assertThat(work.addToSprint(manager, sprint, small, medium, large))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("{\"status\":\"PLANNED\",\"taskCount\":3,\"totalPoints\":16}");

        assertThat(work.start(manager, sprint))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("{\"status\":\"ACTIVE\",\"committedPoints\":16}");
        assertThat(work.start(manager, next))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("sprints.already_active");
        assertThat(work.close(manager, next, "BACKLOG"))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("sprints.not_active");

        work.finish(manager, small);
        assertThat(work.close(manager, sprint, next))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("{\"status\":\"CLOSED\",\"committedPoints\":16,\"completedPoints\":3,"
                        + "\"taskCount\":1,\"totalPoints\":3}");
        assertThat(conforms(get("/api/v1/sprints/" + next)))
                .bodyJson()
                .isLenientlyEqualTo("{\"taskCount\":2,\"totalPoints\":13}");

        MvcTestResult closed = get("/api/v1/sprints/" + sprint);
        assertThat(conforms(mvc.patch()
                        .uri("/api/v1/sprints/{id}", sprint)
                        .headers(manager.headers())
                        .header(HttpHeaders.IF_MATCH, etag(closed))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"goal\":\"Rewrite history\"}")
                        .exchange()))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("sprints.closed");
        assertThat(work.start(manager, sprint))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("sprints.not_planned");
    }

    @Test
    void closingToTheBacklogReturnsUnfinishedTasksToIt() {
        String sprint = work.sprint(manager, projectId, "Sprint 1", today, today.plusDays(6));
        String unfinished = work.task(manager, projectId, "Unfinished", ",\"storyPoints\":5");
        String finished = work.task(manager, projectId, "Finished", ",\"storyPoints\":2");
        work.task(manager, projectId, "Never planned", "");
        work.addToSprint(manager, sprint, unfinished, finished);
        assertThat(conforms(get("/api/v1/projects/" + projectId + "/backlog")))
                .bodyJson()
                .extractingPath("$.content[*].title")
                .isEqualTo(List.of("Never planned"));

        work.start(manager, sprint);
        work.finish(manager, finished);
        assertThat(work.close(manager, sprint, "BACKLOG")).hasStatusOk();

        assertThat(conforms(get("/api/v1/projects/" + projectId + "/backlog")))
                .bodyJson()
                .extractingPath("$.content[*].title")
                .isEqualTo(List.of("Unfinished", "Never planned"));
        assertThat(conforms(get("/api/v1/tasks/" + finished)))
                .bodyJson()
                .extractingPath("$.sprintId")
                .isEqualTo(sprint);
    }

    @Test
    void theBurndownFollowsTheRemainingPointsFromTheFirstDay() {
        String sprint = work.sprint(manager, projectId, "Sprint 1", today, today.plusDays(4));
        String first = work.task(manager, projectId, "First", ",\"storyPoints\":6");
        String second = work.task(manager, projectId, "Second", ",\"storyPoints\":4");
        work.addToSprint(manager, sprint, first, second);
        assertThat(conforms(get("/api/v1/sprints/" + sprint + "/burndown")))
                .bodyJson()
                .doesNotHavePath("$.days[0].actualRemaining");

        work.start(manager, sprint);
        work.finish(manager, first);

        assertThat(conforms(get("/api/v1/sprints/" + sprint + "/burndown")))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("""
                        {"committedPoints":10,
                         "days":[{"date":"%s","idealRemaining":10.0,"actualRemaining":4},
                                 {"idealRemaining":7.5},{"idealRemaining":5.0},{"idealRemaining":2.5},
                                 {"idealRemaining":0.0}]}
                        """.formatted(today));
    }

    @Test
    void velocityShowsTheLastClosedSprintsWithTheirRange() {
        runSprint("Sprint 1", today.minusDays(20), 8);
        runSprint("Sprint 2", today.minusDays(10), 12);

        assertThat(conforms(get("/api/v1/projects/" + projectId + "/velocity?last=6")))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("""
                        {"sprints":[{"name":"Sprint 1","completedPoints":8},{"name":"Sprint 2","completedPoints":12}],
                         "average":10.0,"low":8,"high":12}
                        """);
        assertThat(conforms(get("/api/v1/projects/" + projectId + "/velocity?last=1")))
                .bodyJson()
                .extractingPath("$.sprints[*].name")
                .isEqualTo(List.of("Sprint 2"));
    }

    @Test
    void predictiveProjectsDontRunSprints() {
        String predictive = read(
                conforms(mvc.post()
                        .uri("/api/v1/projects")
                        .headers(manager.headers())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"code":"%s","name":"Data centre","portfolioId":"%s","methodology":"PREDICTIVE",
                                 "startDate":"%s","targetEndDate":"%s"}
                                """.formatted(TestPortfolios.code(), portfolioId, today, today.plusMonths(6)))
                        .exchange()),
                "$.id");

        assertThat(conforms(mvc.post()
                        .uri("/api/v1/projects/{id}/sprints", predictive)
                        .headers(manager.headers())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Sprint 1\",\"startDate\":\"%s\",\"endDate\":\"%s\"}"
                                .formatted(today, today.plusDays(13)))
                        .exchange()))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("sprints.not_agile");
    }

    @Test
    void sprintsOnlyTakeTheirOwnProjectsTasks() {
        String sprint = work.sprint(manager, projectId, "Sprint 1", today, today.plusDays(13));
        String otherProject = portfolios.project(manager, portfolioId);
        String elsewhere = work.task(manager, otherProject, "Elsewhere", "");
        String here = work.task(manager, projectId, "Here", "");

        assertThat(work.addToSprint(manager, sprint, elsewhere))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("taskIds");
        assertThat(conforms(mvc.delete()
                        .uri("/api/v1/sprints/{id}/tasks/{taskId}", sprint, here)
                        .headers(manager.headers())
                        .exchange()))
                .hasStatus(HttpStatus.NOT_FOUND);

        work.addToSprint(manager, sprint, here);
        assertThat(conforms(mvc.delete()
                        .uri("/api/v1/sprints/{id}/tasks/{taskId}", sprint, here)
                        .headers(manager.headers())
                        .exchange()))
                .hasStatus(HttpStatus.NO_CONTENT);
        assertThat(conforms(get("/api/v1/projects/" + projectId + "/sprints")))
                .bodyJson()
                .isLenientlyEqualTo("[{\"name\":\"Sprint 1\",\"taskCount\":0,\"totalPoints\":0}]");
    }

    @Test
    void closingNeedsAPlannedSprintOfTheSameProjectToCarryOverTo() {
        String sprint = work.sprint(manager, projectId, "Sprint 1", today, today.plusDays(13));
        work.start(manager, sprint);

        assertThat(work.close(manager, sprint, sprint))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("carryOverTo");
        assertThat(work.close(manager, sprint, "NEXT")).hasStatus(HttpStatus.BAD_REQUEST);
    }

    private void runSprint(String name, LocalDate start, int points) {
        String sprint = work.sprint(manager, projectId, name, start, start.plusDays(9));
        String task = work.task(manager, projectId, name + " story", ",\"storyPoints\":%d".formatted(points));
        work.addToSprint(manager, sprint, task);
        assertThat(work.start(manager, sprint)).hasStatusOk();
        work.finish(manager, task);
        assertThat(work.close(manager, sprint, "BACKLOG")).hasStatusOk();
    }

    private MvcTestResult get(String uri) {
        return mvc.get().uri(uri).headers(manager.headers()).exchange();
    }
}
