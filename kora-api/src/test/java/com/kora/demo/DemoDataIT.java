package com.kora.demo;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.kora.support.IntegrationTest;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/**
 * Feature 22: with the demo profile, the API starts with a fully populated, coherent organization; every demo login
 * works and every screen has something to show. Its own context (the demo profile), so no other test sees the data.
 */
@IntegrationTest
@ActiveProfiles("demo")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DemoDataIT {

    @Autowired
    private DemoDataSeeder seeder;

    @Autowired
    private MockMvcTester mvc;

    private TestAccounts accounts;
    private Session admin;
    private Session pm;
    private Session member;

    @BeforeAll
    void waitForTheStory() {
        assertThat(seeder.completion()).succeedsWithin(Duration.ofMinutes(4)).isEqualTo(true);
        accounts = new TestAccounts(mvc, null);
        admin = accounts.login(DemoStory.ADMIN, DemoStory.PASSWORD);
        pm = accounts.login("pm@kora.demo", DemoStory.PASSWORD);
        member = accounts.login("member@kora.demo", DemoStory.PASSWORD);
    }

    @Test
    void everyRoleCanSignInWithTheDemoPassword() {
        for (String email : List.of("pmo@kora.demo", "viewer@kora.demo", "olivier.hakizimana@virunga.example")) {
            assertThat(accounts.login(email, DemoStory.PASSWORD).accessToken()).isNotBlank();
        }
        assertThat(get("/api/v1/me", admin))
                .bodyJson()
                .extractingPath("$.memberships.length()")
                .isEqualTo(2);
        // The same languages as the web app's mock data.
        assertThat(get("/api/v1/me", member))
                .bodyJson()
                .extractingPath("$.locale")
                .isEqualTo("rw");
        Session olivier = accounts.login("olivier.hakizimana@virunga.example", DemoStory.PASSWORD);
        assertThat(get("/api/v1/me", olivier))
                .bodyJson()
                .extractingPath("$.locale")
                .isEqualTo("fr");
    }

    @Test
    void theDashboardHasAHealthyALateAndATroubledProject() {
        MvcTestResult summary = get("/api/v1/dashboard/summary", admin);

        assertThat(summary).hasStatusOk();
        assertThat(number(summary, "$.projectCount")).isEqualTo(7);
        Map<String, Object> health = map(summary, "$.byHealth");
        assertThat(health).containsKeys("GREEN", "AMBER", "RED");
        assertThat(map(summary, "$.byStatus")).containsKeys("IN_PROGRESS", "APPROVED", "PROPOSED", "ON_HOLD", "CLOSED");
    }

    @Test
    void theFlagshipProjectHasHistoryInEveryModule() {
        String mobile = projectId(pm, "AKG-001");

        List<Object> scores = list(get("/api/v1/projects/" + mobile + "/risks?size=50", pm), "$.content[*].score");
        assertThat(scores).contains(20, 12, 10, 6, 2);
        List<Object> sprints = list(get("/api/v1/projects/" + mobile + "/sprints", pm), "$[*].status");
        assertThat(sprints).contains("CLOSED", "ACTIVE");
        String closed = list(get("/api/v1/projects/" + mobile + "/sprints", pm), "$[?(@.status == 'CLOSED')].id")
                .getFirst()
                .toString();
        assertThat(number(get("/api/v1/sprints/" + closed + "/burndown", pm), "$.days.length()"))
                .isGreaterThan(10);
        assertThat(number(get("/api/v1/projects/" + mobile + "/velocity", pm), "$.sprints.length()"))
                .isEqualTo(1);
        List<Object> earned = list(get("/api/v1/projects/" + mobile + "/evm/series", pm), "$.points[*].ev");
        assertThat(earned.stream().filter(value -> value != null).count()).isGreaterThan(10);
        assertThat(number(
                        get("/api/v1/projects/" + mobile + "/timesheets?status=APPROVED&size=100", pm),
                        "$.totalElements"))
                .isGreaterThanOrEqualTo(20);
        List<Object> changes =
                list(get("/api/v1/projects/" + mobile + "/change-requests?size=50", pm), "$.content[*].status");
        assertThat(changes).contains("DRAFT", "SUBMITTED", "IN_REVIEW", "IMPLEMENTED", "REJECTED");
        assertThat(number(get("/api/v1/projects/" + mobile + "/stakeholders", pm), "$.totalElements"))
                .isEqualTo(4);
    }

    @Test
    void thePlannedProjectHasACriticalPathAndABaseline() {
        String fitOut = projectId(admin, "AKG-004");

        MvcTestResult schedule = get("/api/v1/projects/" + fitOut + "/schedule", admin);

        assertThat(number(schedule, "$.criticalPath.length()")).isGreaterThanOrEqualTo(4);
        assertThat(schedule).bodyJson().hasPath("$.baseline");
    }

    @Test
    void ericIsOverAllocatedAndHasNotifications() {
        List<Object> bands = list(get("/api/v1/resources/heatmap", admin), "$.people[*].weeks[*].band");
        assertThat(bands).contains("OVER");
        assertThat(number(get("/api/v1/notifications", member), "$.unreadCount"))
                .isPositive();
        assertThat(number(get("/api/v1/audit?limit=5", admin), "$.items.length()"))
                .isEqualTo(5);
    }

    @Test
    void seedingAgainChangesNothing() {
        seeder.seed();

        assertThat(number(get("/api/v1/dashboard/summary", admin), "$.projectCount"))
                .isEqualTo(7);
        assertThat(mvc.post()
                        .uri("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"pm@kora.demo\",\"password\":\"wrong-password-123\"}")
                        .exchange())
                .hasStatus(HttpStatus.UNAUTHORIZED);
    }

    private String projectId(Session session, String code) {
        List<Object> ids = list(get("/api/v1/projects?q=" + code, session), "$.content[*].id");
        assertThat(ids).hasSize(1);
        return ids.getFirst().toString();
    }

    private MvcTestResult get(String uri, Session session) {
        MvcTestResult result = mvc.get().uri(uri).headers(session.headers()).exchange();
        assertThat(result).as(uri).hasStatusOk();
        return result;
    }

    private static int number(MvcTestResult result, String path) {
        Integer value = JsonPath.read(TestAccounts.body(result), path);
        return value;
    }

    private static List<Object> list(MvcTestResult result, String path) {
        return JsonPath.read(TestAccounts.body(result), path);
    }

    private static Map<String, Object> map(MvcTestResult result, String path) {
        return JsonPath.read(TestAccounts.body(result), path);
    }
}
