package com.kora.schedule;

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
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/** Feature 10: dependencies, the critical path on working days, baselines and the working calendar. */
@IntegrationTest
class ScheduleIT {

    /** Projects start on a Monday, so the expected dates below are easy to check by hand. */
    private static final LocalDate MONDAY = LocalDate.now().with(TemporalAdjusters.next(DayOfWeek.MONDAY));

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

    @BeforeEach
    void setUp() {
        TestAccounts accounts = new TestAccounts(mvc, emails);
        portfolios = new TestPortfolios(mvc);
        work = new TestWork(mvc);
        admin = accounts.registerOrganization();
        manager = accounts.join(admin, Role.PROJECT_MANAGER);
        portfolioId = portfolios.portfolio(admin);
        projectId = portfolios.project(manager, portfolioId, "PREDICTIVE", MONDAY);
    }

    /** A(3) → B(4) → D(5) and A → C(2) → D over Monday-to-Friday weeks: A-B-D is critical, C has 2 days of float. */
    @Test
    void computesTheCriticalPathOverWorkingDays() {
        String a = task("Design", 3);
        String b = task("Build", 4);
        String c = task("Docs", 2);
        String d = task("Test", 5);
        link(a, b);
        link(a, c);
        link(b, d);
        link(c, d);

        MvcTestResult schedule = conforms(schedule());

        assertThat(schedule).hasStatusOk().bodyJson().isLenientlyEqualTo("""
                        {"projectStart":"%s","projectFinish":"%s","criticalPath":["%s","%s","%s"],
                         "tasks":[
                           {"taskId":"%s","earlyStart":"%s","earlyFinish":"%s","totalFloat":0,"critical":true},
                           {"taskId":"%s","earlyStart":"%s","earlyFinish":"%s","totalFloat":0,"critical":true},
                           {"taskId":"%s","earlyStart":"%s","earlyFinish":"%s","lateStart":"%s","lateFinish":"%s",
                            "totalFloat":2,"freeFloat":2,"critical":false},
                           {"taskId":"%s","earlyStart":"%s","earlyFinish":"%s","totalFloat":0,"critical":true}]}
                        """.formatted(
                        MONDAY, day(15), a, b, d, a, MONDAY, day(2), b, day(3), day(8), c, day(3), day(4), day(7),
                        day(8), d, day(9), day(15)));
        assertThat(schedule).bodyJson().doesNotHavePath("$.baseline");
    }

    @Test
    void holidaysAndTheWorkingWeekMoveTheDates() {
        task("Design", 3);

        assertThat(conforms(mvc.put()
                        .uri("/api/v1/organization/calendar")
                        .headers(admin.headers())
                        .header(HttpHeaders.IF_MATCH, "\"0\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"workingDays":["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY"],
                                 "holidays":[{"date":"%s","name":"Founders' Day"}]}
                                """.formatted(day(1)))
                        .exchange()))
                .hasStatusOk()
                .hasHeader(HttpHeaders.ETAG, "\"1\"")
                .bodyJson()
                .isLenientlyEqualTo("{\"version\":1,\"holidays\":[{\"name\":\"Founders' Day\"}]}");

        assertThat(conforms(schedule()))
                .bodyJson()
                .extractingPath("$.tasks[0].earlyFinish")
                .isEqualTo(day(3).toString());
        assertThat(conforms(mvc.put()
                        .uri("/api/v1/organization/calendar")
                        .headers(admin.headers())
                        .header(HttpHeaders.IF_MATCH, "\"0\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"workingDays\":[\"MONDAY\"],\"holidays\":[]}")
                        .exchange()))
                .hasStatus(HttpStatus.PRECONDITION_FAILED);
    }

    @Test
    void theCalendarStartsAsMondayToFriday() {
        assertThat(conforms(mvc.get()
                        .uri("/api/v1/organization/calendar")
                        .headers(manager.headers())
                        .exchange()))
                .hasStatusOk()
                .hasHeader(HttpHeaders.ETAG, "\"0\"")
                .bodyJson()
                .isLenientlyEqualTo("""
                        {"workingDays":["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY"],"holidays":[],
                         "version":0}
                        """);
    }

    @Test
    void aLinkThatWouldCloseALoopIsRefusedWithTheChain() {
        MvcTestResult first = work.createTask(manager, projectId, "First", "");
        MvcTestResult second = work.createTask(manager, projectId, "Second", "");
        MvcTestResult third = work.createTask(manager, projectId, "Third", "");
        String a = read(first, "$.id");
        String b = read(second, "$.id");
        String c = read(third, "$.id");
        link(a, b);
        link(b, c);

        assertThat(createLink(c, a)).hasStatus(HttpStatus.CONFLICT).bodyJson().isLenientlyEqualTo("""
                        {"code":"schedule.cycle",
                         "errors":[{"field":"successorId","params":{"cycle":["%s","%s","%s","%s"]}}]}
                        """.formatted(
                        read(third, "$.key"), read(first, "$.key"), read(second, "$.key"), read(third, "$.key")));
        assertThat(createLink(a, b))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("schedule.dependency_exists");
        assertThat(createLink(a, a))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("successorId");
        String elsewhere = work.task(manager, portfolios.project(manager, portfolioId, "PREDICTIVE", MONDAY), "X", "");
        assertThat(createLink(elsewhere, a))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("predecessorId");
    }

    @Test
    void theScheduleIsMeasuredAgainstTheLatestBaseline() {
        String a = task("Design", 3);
        String b = task("Build", 4);
        link(a, b);

        assertThat(conforms(mvc.post()
                        .uri("/api/v1/projects/{id}/schedule/baseline", projectId)
                        .headers(manager.headers())
                        .exchange()))
                .hasStatus(HttpStatus.CREATED)
                .bodyJson()
                .isLenientlyEqualTo(
                        "{\"number\":1,\"taskCount\":2,\"savedBy\":{\"fullName\":\"PROJECT_MANAGER User\"}}");

        MvcTestResult current = mvc.get()
                .uri("/api/v1/tasks/{id}", a)
                .headers(manager.headers())
                .exchange();
        assertThat(conforms(mvc.patch()
                        .uri("/api/v1/tasks/{id}", a)
                        .headers(manager.headers())
                        .header(HttpHeaders.IF_MATCH, etag(current))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"durationDays\":5}")
                        .exchange()))
                .hasStatusOk();

        assertThat(conforms(schedule())).bodyJson().isLenientlyEqualTo("""
                        {"baseline":{"number":1},
                         "tasks":[{"taskId":"%s","finishVariance":2,"startVariance":0,"baselineFinish":"%s"},
                                  {"taskId":"%s","startVariance":2,"finishVariance":2,"baselineStart":"%s"}]}
                        """.formatted(a, day(2), b, day(3)));
        assertThat(conforms(mvc.post()
                        .uri("/api/v1/projects/{id}/schedule/baseline", projectId)
                        .headers(manager.headers())
                        .exchange()))
                .bodyJson()
                .extractingPath("$.number")
                .isEqualTo(2);
    }

    @Test
    void aStartNoEarlierThanConstraintHoldsATaskBack() {
        MvcTestResult created = work.createTask(manager, projectId, "Install", """
                ,"durationDays":2,"scheduleConstraint":"START_NO_EARLIER_THAN","constraintDate":"%s"
                """.formatted(day(7)));
        assertThat(created)
                .hasStatus(HttpStatus.CREATED)
                .bodyJson()
                .isLenientlyEqualTo("{\"scheduleConstraint\":\"START_NO_EARLIER_THAN\"}");

        assertThat(conforms(schedule()))
                .bodyJson()
                .extractingPath("$.tasks[0].earlyStart")
                .isEqualTo(day(7).toString());
        assertThat(work.createTask(manager, projectId, "Broken", ",\"scheduleConstraint\":\"START_NO_EARLIER_THAN\""))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("constraintDate");
    }

    @Test
    void agileProjectsHaveNoDependenciesButStillShowTheirTasks() {
        String agile = portfolios.project(manager, portfolioId);
        String a = work.task(manager, agile, "A", "");
        String b = work.task(manager, agile, "B", "");

        assertThat(conforms(mvc.post()
                        .uri("/api/v1/projects/{id}/dependencies", agile)
                        .headers(manager.headers())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"predecessorId\":\"%s\",\"successorId\":\"%s\"}".formatted(a, b))
                        .exchange()))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("schedule.not_predictive");
        assertThat(conforms(mvc.get()
                        .uri("/api/v1/projects/{id}/schedule", agile)
                        .headers(manager.headers())
                        .exchange()))
                .hasStatusOk()
                .bodyJson()
                .extractingPath("$.tasks.length()")
                .isEqualTo(2);
    }

    @Test
    void dependenciesGoAwayWhenRemovedOrWhenTheirTaskIsDeleted() {
        String a = task("A", 1);
        String b = task("B", 1);
        String c = task("C", 1);
        String first = read(link(a, b), "$.id");
        link(b, c);

        assertThat(conforms(mvc.delete()
                        .uri("/api/v1/dependencies/{id}", first)
                        .headers(manager.headers())
                        .exchange()))
                .hasStatus(HttpStatus.NO_CONTENT);
        assertThat(conforms(mvc.delete()
                        .uri("/api/v1/tasks/{id}", c)
                        .headers(manager.headers())
                        .exchange()))
                .hasStatus(HttpStatus.NO_CONTENT);

        assertThat(conforms(mvc.get()
                        .uri("/api/v1/projects/{id}/dependencies", projectId)
                        .headers(manager.headers())
                        .exchange()))
                .hasStatusOk()
                .bodyJson()
                .isEqualTo("[]");
    }

    private String task(String title, int duration) {
        return work.task(manager, projectId, title, ",\"durationDays\":%d".formatted(duration));
    }

    private MvcTestResult link(String predecessor, String successor) {
        MvcTestResult result = createLink(predecessor, successor);
        assertThat(result).hasStatus(HttpStatus.CREATED);
        return result;
    }

    private MvcTestResult createLink(String predecessor, String successor) {
        return conforms(mvc.post()
                .uri("/api/v1/projects/{id}/dependencies", projectId)
                .headers(manager.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"predecessorId\":\"%s\",\"successorId\":\"%s\"}".formatted(predecessor, successor))
                .exchange());
    }

    private MvcTestResult schedule() {
        return mvc.get()
                .uri("/api/v1/projects/{id}/schedule", projectId)
                .headers(manager.headers())
                .exchange();
    }

    private static LocalDate day(int offset) {
        return MONDAY.plusDays(offset);
    }
}
