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
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/**
 * Feature 16: the heat map combines capacity, holidays, leave, allocations and logged hours. The week of Monday
 * 21 December 2026 has Christmas on the Friday.
 */
@IntegrationTest
class ResourceIT {

    private static final String CHRISTMAS_WEEK = "2026-12-21";

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private Session admin;
    private Session manager;
    private Session member;
    private String projectId;
    private String task;

    @BeforeEach
    void setUp() {
        TestAccounts accounts = new TestAccounts(mvc, emails);
        TestPortfolios portfolios = new TestPortfolios(mvc);
        admin = accounts.registerOrganization();
        manager = accounts.join(admin, Role.PROJECT_MANAGER);
        member = accounts.join(admin, Role.MEMBER);
        projectId = portfolios.project(manager, portfolios.portfolio(admin));
        portfolios.addToTeam(manager, projectId, member.userId(), "CONTRIBUTOR");
        task = new TestWork(mvc).task(manager, projectId, "Year-end release", "");
    }

    @Test
    void theHeatMapCombinesCapacityHolidaysLeaveAllocationsAndLoggedTime() {
        assertThat(conforms(mvc.post()
                        .uri("/api/v1/organization/calendar/public-holidays")
                        .headers(admin.headers())
                        .header(HttpHeaders.IF_MATCH, "\"0\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"country\":\"RW\",\"year\":2026}")
                        .exchange()))
                .hasStatusOk()
                .bodyJson()
                .extractingPath("$.holidays.length()")
                .isEqualTo(13);
        assertThat(conforms(put(
                        "/api/v1/users/" + member.userId() + "/capacity",
                        admin,
                        "{\"hoursPerWeek\":30,\"validFrom\":\"2026-01-01\"}")))
                .hasStatusOk()
                .bodyJson()
                .extractingPath("$.history.length()")
                .isEqualTo(1);
        assertThat(conforms(put(
                        "/api/v1/projects/" + projectId + "/allocations",
                        manager,
                        "{\"allocations\":[{\"userId\":\"%s\",\"weekStart\":\"%s\",\"hours\":36}]}"
                                .formatted(member.userId(), CHRISTMAS_WEEK))))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("[{\"weekStart\":\"%s\",\"hours\":36.0,\"user\":{\"userId\":\"%s\"}}]"
                        .formatted(CHRISTMAS_WEEK, member.userId()));
        assertThat(conforms(put(
                        "/api/v1/timesheets/me/2026-W52/entries",
                        member,
                        "{\"entries\":[{\"taskId\":\"%s\",\"date\":\"%s\",\"hours\":3}]}"
                                .formatted(task, CHRISTMAS_WEEK))))
                .hasStatusOk();

        // 30 h × 4 of 5 working days (Christmas on Friday) = 24 h; 36 allocated is 150 %
        assertThat(memberWeek()).bodyJson().isLenientlyEqualTo("""
                        {"people":[{"user":{"userId":"%s"},"weeks":[{"weekStart":"%s","capacityHours":24.0,
                          "allocatedHours":36.0,"actualHours":3.0,"utilization":150.0,"band":"OVER"}]}]}
                        """.formatted(member.userId(), CHRISTMAS_WEEK));

        assertThat(conforms(post(
                        "/api/v1/users/" + member.userId() + "/leave",
                        member,
                        "{\"from\":\"2026-12-21\",\"to\":\"2026-12-22\",\"reason\":\"Family\"}")))
                .hasStatus(HttpStatus.CREATED);
        // Two working days left: 12 h
        assertThat(memberWeek())
                .bodyJson()
                .isLenientlyEqualTo(
                        "{\"people\":[{\"weeks\":[{\"capacityHours\":12.0,\"utilization\":300.0,\"band\":\"OVER\"}]}]}");
    }

    @Test
    void membersSeeOnlyThemselvesAndPlannersSeeEveryone() {
        assertThat(conforms(get("/api/v1/resources/heatmap?from=2026-10-05&to=2026-10-11", member)))
                .bodyJson()
                .extractingPath("$.people[*].user.userId")
                .isEqualTo(List.of(member.userId().toString()));
        assertThat(conforms(get("/api/v1/resources/heatmap?from=2026-10-05&to=2026-10-11", manager)))
                .bodyJson()
                .extractingPath("$.people.length()")
                .isEqualTo(3);
        assertThat(conforms(get("/api/v1/resources/heatmap?from=2026-01-05&to=2026-12-28", manager)))
                .hasStatus(HttpStatus.BAD_REQUEST);
    }

    @Test
    void allocationsArePlannedByManagersOnMondaysAndZeroRemovesThem() {
        String allocations = "/api/v1/projects/" + projectId + "/allocations";
        String monday = "{\"allocations\":[{\"userId\":\"%s\",\"weekStart\":\"2026-10-05\",\"hours\":%s}]}";

        assertThat(conforms(put(allocations, member, monday.formatted(member.userId(), 10))))
                .hasStatus(HttpStatus.FORBIDDEN);
        assertThat(conforms(put(
                        allocations,
                        manager,
                        "{\"allocations\":[{\"userId\":\"%s\",\"weekStart\":\"2026-10-06\",\"hours\":10}]}"
                                .formatted(member.userId()))))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("allocations[0].weekStart");
        assertThat(conforms(put(allocations, manager, monday.formatted(member.userId(), 10))))
                .bodyJson()
                .extractingPath("$.length()")
                .isEqualTo(1);
        assertThat(conforms(put(allocations, manager, monday.formatted(member.userId(), 0))))
                .bodyJson()
                .isEqualTo("[]");
        assertThat(conforms(get(allocations, member))).hasStatusOk();
    }

    @Test
    void capacityIsVisibleToThePersonAndPlannersAndLeaveIsTheirs() {
        Session colleague = new TestAccounts(mvc, emails).join(admin, Role.MEMBER);
        String capacity = "/api/v1/users/" + member.userId() + "/capacity";

        assertThat(conforms(get(capacity, member)))
                .bodyJson()
                .isLenientlyEqualTo("{\"hoursPerWeek\":40,\"history\":[],\"leave\":[]}");
        assertThat(conforms(get(capacity, colleague))).hasStatus(HttpStatus.FORBIDDEN);
        assertThat(conforms(put(capacity, member, "{\"hoursPerWeek\":20,\"validFrom\":\"2026-01-01\"}")))
                .hasStatus(HttpStatus.FORBIDDEN);

        String leave = read(
                conforms(post(
                        "/api/v1/users/" + member.userId() + "/leave",
                        member,
                        "{\"from\":\"2026-11-02\",\"to\":\"2026-11-06\"}")),
                "$.id");
        assertThat(conforms(mvc.delete()
                        .uri("/api/v1/leave/{id}", leave)
                        .headers(colleague.headers())
                        .exchange()))
                .hasStatus(HttpStatus.FORBIDDEN);
        assertThat(conforms(mvc.delete()
                        .uri("/api/v1/leave/{id}", leave)
                        .headers(member.headers())
                        .exchange()))
                .hasStatus(HttpStatus.NO_CONTENT);
    }

    /** The heat map of the Christmas week for the project: exactly the member, one week. */
    private MvcTestResult memberWeek() {
        return conforms(get(
                "/api/v1/resources/heatmap?from=%s&to=%s&projectId=%s"
                        .formatted(CHRISTMAS_WEEK, CHRISTMAS_WEEK, projectId),
                manager));
    }

    private MvcTestResult put(String uri, Session session, String body) {
        return mvc.put()
                .uri(uri)
                .headers(session.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
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
