package com.kora.resourcing;

import static com.kora.support.Contract.conforms;
import static com.kora.support.Contract.responseConforms;
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
import java.time.ZoneId;
import java.time.temporal.IsoFields;
import java.time.temporal.TemporalAdjusters;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/** Feature 15: logging a week, the daily limit, submitting, approving and rejecting, and cost rates. */
@IntegrationTest
class TimesheetIT {

    /** This week in the organization's time zone (registration defaults to Kigali). */
    private static final LocalDate MONDAY =
            LocalDate.now(ZoneId.of("Africa/Kigali")).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));

    private static final String WEEK =
            "%d-W%02d".formatted(MONDAY.get(IsoFields.WEEK_BASED_YEAR), MONDAY.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR));

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private TestAccounts accounts;
    private Session admin;
    private Session manager;
    private Session member;
    private String projectId;
    private String design;
    private String build;

    @BeforeEach
    void setUp() {
        accounts = new TestAccounts(mvc, emails);
        TestPortfolios portfolios = new TestPortfolios(mvc);
        TestWork work = new TestWork(mvc);
        admin = accounts.registerOrganization();
        manager = accounts.join(admin, Role.PROJECT_MANAGER);
        member = accounts.join(admin, Role.MEMBER);
        projectId = portfolios.project(manager, portfolios.portfolio(admin));
        portfolios.addToTeam(manager, projectId, member.userId(), "CONTRIBUTOR");
        design = work.task(manager, projectId, "Design", "");
        build = work.task(manager, projectId, "Build", "");
    }

    @Test
    void aWeekIsLoggedWithDailyTotals() {
        assertThat(conforms(get("/api/v1/timesheets/me", member)))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo(
                        "{\"week\":\"%s\",\"status\":\"DRAFT\",\"editable\":true,\"entries\":[]}".formatted(WEEK));

        MvcTestResult saved = save(
                member,
                entry(design, MONDAY, "6") + "," + entry(build, MONDAY, "2.5") + ","
                        + entry(build, MONDAY.plusDays(2), "8"));

        assertThat(saved).hasStatusOk().bodyJson().isLenientlyEqualTo("""
                        {"week":"%s","weekStart":"%s","status":"DRAFT","editable":true,"totalHours":16.5,
                         "sheets":[{"projectId":"%s","status":"DRAFT","totalHours":16.5,"user":{"userId":"%s"}}]}
                        """.formatted(
                        WEEK, MONDAY, projectId, member.userId()));
        assertThat(saved).bodyJson().extractingPath("$.dailyTotals[0].hours").isEqualTo(8.5);
        assertThat(saved).bodyJson().extractingPath("$.dailyTotals.length()").isEqualTo(7);
        assertThat(saved).bodyJson().extractingPath("$.entries.length()").isEqualTo(3);
    }

    @Test
    void aDayHoldsAtMost24HoursAndTimeIsInQuarterHours() {
        assertThat(save(member, entry(design, MONDAY, "16") + "," + entry(build, MONDAY, "8.25")))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].message")
                .asString()
                .contains("totals 24.25 h; a day holds at most 24");
        assertThat(responseConforms(put(member, entry(design, MONDAY, "1.1"))))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("entries[0].hours");
        assertThat(save(member, entry(design, MONDAY.minusDays(1), "1")))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("entries[0].date");
    }

    @Test
    void submittedTimeIsLockedUntilTheManagerDecides() {
        String entries = entry(design, MONDAY, "8");
        save(member, entries);
        assertThat(conforms(post("/api/v1/timesheets/me/" + WEEK + "/submit", member, "")))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("{\"status\":\"SUBMITTED\",\"editable\":false}");

        assertThat(save(member, entry(design, MONDAY, "7")))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("timesheets.locked");
        assertThat(save(member, entries)).hasStatusOk();

        MvcTestResult waiting =
                conforms(get("/api/v1/projects/" + projectId + "/timesheets?status=SUBMITTED", manager));
        assertThat(waiting).bodyJson().extractingPath("$.totalElements").isEqualTo(1);
        String sheet = read(waiting, "$.content[0].id");
        assertThat(conforms(post("/api/v1/timesheets/" + sheet + "/approve", manager, "")))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("{\"status\":\"APPROVED\",\"decidedBy\":{\"userId\":\"%s\"},\"entries\":[{}]}"
                        .formatted(manager.userId()));
        assertThat(conforms(get("/api/v1/timesheets/me?week=" + WEEK, member)))
                .bodyJson()
                .extractingPath("$.status")
                .isEqualTo("APPROVED");
        assertThat(conforms(post("/api/v1/timesheets/me/" + WEEK + "/submit", member, "")))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("timesheets.empty");
    }

    @Test
    void aRejectedWeekCarriesTheCommentAndCanBeResubmitted() {
        save(member, entry(design, MONDAY, "8"));
        post("/api/v1/timesheets/me/" + WEEK + "/submit", member, "");
        String sheet = read(get("/api/v1/projects/" + projectId + "/timesheets", manager), "$.content[0].id");

        assertThat(responseConforms(post("/api/v1/timesheets/" + sheet + "/reject", manager, "{}")))
                .hasStatus(HttpStatus.BAD_REQUEST);
        assertThat(conforms(post(
                        "/api/v1/timesheets/" + sheet + "/reject", manager, "{\"comment\":\"Tuesday is missing\"}")))
                .hasStatusOk();

        assertThat(conforms(get("/api/v1/timesheets/me?week=" + WEEK, member)))
                .bodyJson()
                .isLenientlyEqualTo("""
                        {"status":"REJECTED","editable":true,"sheets":[{"comment":"Tuesday is missing"}]}
                        """);
        assertThat(save(member, entry(design, MONDAY, "8") + "," + entry(design, MONDAY.plusDays(1), "8")))
                .hasStatusOk();
        assertThat(conforms(post("/api/v1/timesheets/me/" + WEEK + "/submit", member, "")))
                .bodyJson()
                .extractingPath("$.status")
                .isEqualTo("SUBMITTED");
    }

    @Test
    void nobodyApprovesTheirOwnTime() {
        save(manager, entry(design, MONDAY, "4"));
        post("/api/v1/timesheets/me/" + WEEK + "/submit", manager, "");
        String sheet = read(get("/api/v1/projects/" + projectId + "/timesheets", manager), "$.content[0].id");

        assertThat(conforms(post("/api/v1/timesheets/" + sheet + "/approve", manager, "")))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("timesheets.self_approval");
        assertThat(conforms(post("/api/v1/timesheets/" + sheet + "/approve", admin, "")))
                .hasStatusOk();
    }

    @Test
    void onlyTheProjectsWorkersLogTimeOnIt() {
        Session observer = accounts.join(admin, Role.MEMBER);
        new TestPortfolios(mvc).addToTeam(manager, projectId, observer.userId(), "OBSERVER");
        Session stranger = accounts.registerOrganization();

        assertThat(save(observer, entry(design, MONDAY, "1"))).hasStatus(HttpStatus.FORBIDDEN);
        assertThat(save(stranger, entry(design, MONDAY, "1")))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("entries[0].taskId");

        save(member, entry(design, MONDAY, "2"));
        String sheet = read(get("/api/v1/timesheets/me", member), "$.sheets[0].id");
        assertThat(conforms(get("/api/v1/timesheets/" + sheet, member))).hasStatusOk();
        assertThat(conforms(get("/api/v1/timesheets/" + sheet, observer))).hasStatus(HttpStatus.FORBIDDEN);
        assertThat(conforms(get("/api/v1/timesheets/" + sheet, stranger))).hasStatus(HttpStatus.NOT_FOUND);
    }

    @Test
    void costRatesAreForAdministratorsAndThePmoInTheOrganizationsCurrency() {
        String rates = "/api/v1/users/" + member.userId() + "/cost-rates";

        assertThat(conforms(post(
                        rates,
                        admin,
                        "{\"hourlyRate\":{\"amount\":\"12000\",\"currency\":\"RWF\"},"
                                + "\"validFrom\":\"2026-01-01\"}")))
                .hasStatus(HttpStatus.CREATED)
                .bodyJson()
                .extractingPath("$.hourlyRate.amount")
                .isEqualTo("12000");
        assertThat(conforms(post(
                        rates,
                        admin,
                        "{\"hourlyRate\":{\"amount\":\"10\",\"currency\":\"USD\"}," + "\"validFrom\":\"2026-06-01\"}")))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("hourlyRate.currency");
        assertThat(conforms(get(rates, member))).hasStatus(HttpStatus.FORBIDDEN);
        assertThat(conforms(get(rates, admin)))
                .bodyJson()
                .extractingPath("$.length()")
                .isEqualTo(1);
    }

    static String entry(String task, LocalDate date, String hours) {
        return "{\"taskId\":\"%s\",\"date\":\"%s\",\"hours\":%s}".formatted(task, date, hours);
    }

    private MvcTestResult save(Session session, String entries) {
        return conforms(put(session, entries));
    }

    private MvcTestResult put(Session session, String entries) {
        return mvc.put()
                .uri("/api/v1/timesheets/me/{week}/entries", WEEK)
                .headers(session.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"entries\":[" + entries + "]}")
                .exchange();
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
