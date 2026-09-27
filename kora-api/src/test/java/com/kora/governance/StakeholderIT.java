package com.kora.governance;

import static com.kora.support.Contract.conforms;
import static com.kora.support.TestPortfolios.read;
import static org.assertj.core.api.Assertions.assertThat;

import com.kora.organization.Role;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import com.kora.support.TestPortfolios;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/** Feature 13: the stakeholder register, the power/interest grid, the gap filter and erasure. */
@IntegrationTest
class StakeholderIT {

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private Session manager;
    private Session contributor;
    private String projectId;

    @BeforeEach
    void setUp() {
        TestAccounts accounts = new TestAccounts(mvc, emails);
        TestPortfolios portfolios = new TestPortfolios(mvc);
        Session admin = accounts.registerOrganization();
        manager = accounts.join(admin, Role.PROJECT_MANAGER);
        contributor = accounts.join(admin, Role.MEMBER);
        projectId = portfolios.project(manager, portfolios.portfolio(admin));
        portfolios.addToTeam(manager, projectId, contributor.userId(), "CONTRIBUTOR");
    }

    @Test
    void theGridPlacesEveryoneAndTheGapFilterFindsWhoNeedsAttention() {
        add("Board chair", 5, 5, "SUPPORTIVE", "LEADING");
        add("Regulator", 5, 1, "NEUTRAL", "NEUTRAL");
        add("Branch staff", 2, 5, "RESISTANT", "SUPPORTIVE");
        add("Press", 1, 2, "UNAWARE", "UNAWARE");

        MvcTestResult grid = conforms(get("/api/v1/projects/" + projectId + "/stakeholders/grid"));

        assertThat(grid)
                .hasStatusOk()
                .bodyJson()
                .extractingPath("$.quadrants[*].quadrant")
                .isEqualTo(List.of("MANAGE_CLOSELY", "KEEP_SATISFIED", "KEEP_INFORMED", "MONITOR"));
        assertThat(grid)
                .bodyJson()
                .extractingPath("$.quadrants[*].stakeholders[0].name")
                .isEqualTo(List.of("Board chair", "Regulator", "Branch staff", "Press"));
        assertThat(grid)
                .bodyJson()
                .extractingPath("$.quadrants[*].stakeholders[0].engagementGap")
                .isEqualTo(List.of(1, 0, 2, 0));
    }

    @Test
    void theGapFilterListsOnlyStakeholdersBelowTheirDesiredEngagement() {
        add("Board chair", 5, 5, "SUPPORTIVE", "LEADING");
        add("Regulator", 5, 1, "NEUTRAL", "NEUTRAL");
        add("Branch staff", 2, 5, "RESISTANT", "SUPPORTIVE");

        assertThat(conforms(get("/api/v1/projects/" + projectId + "/stakeholders?gap=true")))
                .bodyJson()
                .extractingPath("$.content[*].name")
                .isEqualTo(List.of("Board chair", "Branch staff"));
        assertThat(conforms(get("/api/v1/projects/" + projectId + "/stakeholders?quadrant=KEEP_SATISFIED")))
                .bodyJson()
                .extractingPath("$.content[*].name")
                .isEqualTo(List.of("Regulator"));
    }

    @Test
    void removingAStakeholderErasesTheirPersonalDataAndHidesThem() {
        String alice = read(conforms(post("/api/v1/projects/" + projectId + "/stakeholders", manager, """
                        {"name":"Alice Uwase","organization":"Bank of Kigali","role":"CFO","email":"alice@example.com",
                         "phone":"+250 788 000 000","power":4,"interest":5,"currentEngagement":"NEUTRAL",
                         "desiredEngagement":"SUPPORTIVE","notes":"Prefers numbers"}
                        """)), "$.id");

        assertThat(conforms(mvc.delete()
                        .uri("/api/v1/stakeholders/{id}", alice)
                        .headers(manager.headers())
                        .exchange()))
                .hasStatus(HttpStatus.NO_CONTENT);

        MvcTestResult removed = conforms(get("/api/v1/stakeholders/" + alice));
        assertThat(removed)
                .bodyJson()
                .isLenientlyEqualTo("{\"name\":\"Removed stakeholder\",\"removed\":true,\"power\":4}");
        assertThat(removed).bodyJson().doesNotHavePath("$.email");
        assertThat(removed).bodyJson().doesNotHavePath("$.phone");
        assertThat(removed).bodyJson().doesNotHavePath("$.organization");
        assertThat(removed).bodyJson().doesNotHavePath("$.notes");
        assertThat(conforms(get("/api/v1/projects/" + projectId + "/stakeholders")))
                .bodyJson()
                .extractingPath("$.totalElements")
                .isEqualTo(0);
    }

    @Test
    void onlyManagersMaintainTheRegister() {
        assertThat(conforms(post(
                        "/api/v1/projects/" + projectId + "/stakeholders",
                        contributor,
                        "{\"name\":\"Someone\",\"power\":1,\"interest\":1,\"currentEngagement\":\"UNAWARE\","
                                + "\"desiredEngagement\":\"NEUTRAL\"}")))
                .hasStatus(HttpStatus.FORBIDDEN);
    }

    private void add(String name, int power, int interest, String current, String desired) {
        assertThat(conforms(post("/api/v1/projects/" + projectId + "/stakeholders", manager, """
                        {"name":"%s","power":%d,"interest":%d,"currentEngagement":"%s","desiredEngagement":"%s"}
                        """.formatted(
                                name, power, interest, current, desired))))
                .hasStatus(HttpStatus.CREATED);
    }

    private MvcTestResult post(String uri, Session session, String body) {
        return mvc.post()
                .uri(uri)
                .headers(session.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .exchange();
    }

    private MvcTestResult get(String uri) {
        return mvc.get().uri(uri).headers(manager.headers()).exchange();
    }
}
