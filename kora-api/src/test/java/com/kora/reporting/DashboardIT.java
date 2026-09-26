package com.kora.reporting;

import static com.kora.support.Contract.conforms;
import static org.assertj.core.api.Assertions.assertThat;

import com.kora.organization.Role;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import com.kora.support.TestPortfolios;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

/** Feature 05: the portfolio dashboard, its health rule and who sees what. */
@IntegrationTest
class DashboardIT {

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private TestAccounts accounts;
    private TestPortfolios portfolios;
    private Session admin;
    private Session manager;
    private String portfolioId;

    @BeforeEach
    void setUp() {
        accounts = new TestAccounts(mvc, emails);
        portfolios = new TestPortfolios(mvc);
        admin = accounts.registerOrganization();
        manager = accounts.join(admin, Role.PROJECT_MANAGER);
        portfolioId = portfolios.portfolio(admin);
    }

    @Test
    void summarizesStatusHealthBudgetsAndLateness() {
        portfolios.project(
                manager, portfolioId, LocalDate.now(), LocalDate.now().plusMonths(2), "1000000");
        String onTrack = portfolios.project(
                manager, portfolioId, LocalDate.now(), LocalDate.now().plusMonths(6), "2000000");
        String late = portfolios.project(
                manager,
                portfolioId,
                LocalDate.now().minusMonths(6),
                LocalDate.now().minusDays(3),
                "500000");
        portfolios.start(manager, admin, onTrack);
        portfolios.start(manager, admin, late);

        assertThat(conforms(mvc.get()
                        .uri("/api/v1/dashboard/summary?portfolioId={id}", portfolioId)
                        .headers(admin.headers())
                        .exchange()))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "projectCount": 3,
                          "byStatus": { "PROPOSED": 1, "IN_PROGRESS": 2 },
                          "byHealth": { "GREY": 1, "GREEN": 1, "AMBER": 1 },
                          "totalBudget": { "amount": "3500000", "currency": "RWF" },
                          "lateProjects": 1 }
                        """);
    }

    @Test
    void listsProjectsThatNeedAttentionFirst() {
        String grey = portfolios.project(manager, portfolioId);
        String green = portfolios.project(manager, portfolioId);
        String amber = portfolios.project(
                manager,
                portfolioId,
                LocalDate.now().minusMonths(3),
                LocalDate.now().minusDays(3),
                null);
        String red = portfolios.project(manager, portfolioId);
        portfolios.start(manager, admin, green);
        portfolios.start(manager, admin, amber);
        mvc.put()
                .uri("/api/v1/projects/{id}/health-override", red)
                .headers(manager.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"health\":\"RED\",\"reason\":\"Key engineer resigned\"}")
                .exchange();

        assertThat(conforms(mvc.get()
                        .uri("/api/v1/dashboard/projects?portfolioId={id}", portfolioId)
                        .headers(admin.headers())
                        .exchange()))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "totalElements": 4,
                          "content": [
                            { "projectId": "%s", "health": "RED", "healthOverridden": true,
                              "healthReason": "Key engineer resigned" },
                            { "projectId": "%s", "health": "AMBER" },
                            { "projectId": "%s", "health": "GREY", "healthReason": "Not started" },
                            { "projectId": "%s", "health": "GREEN", "healthReason": "On track",
                              "nextMilestone": { "name": "Beta" } } ] }
                        """.formatted(red, amber, grey, green));
    }

    @Test
    void membersSeeOnlyTheirProjectsOnTheDashboard() {
        String mine = portfolios.project(manager, portfolioId);
        portfolios.project(admin, portfolioId);
        Session member = accounts.join(admin, Role.MEMBER);
        portfolios.addToTeam(manager, mine, member.userId(), "OBSERVER");

        assertThat(conforms(mvc.get()
                        .uri("/api/v1/dashboard/projects")
                        .headers(member.headers())
                        .exchange()))
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "totalElements": 1, "content": [{ "projectId": "%s" }] }
                        """.formatted(mine));
        assertThat(conforms(mvc.get()
                        .uri("/api/v1/dashboard/summary")
                        .headers(member.headers())
                        .exchange()))
                .bodyJson()
                .extractingPath("$.projectCount")
                .isEqualTo(1);
    }

    @Test
    void anEmptyOrganizationHasAnEmptyDashboardInItsCurrency() {
        Session newcomer = accounts.registerOrganization();

        assertThat(conforms(mvc.get()
                        .uri("/api/v1/dashboard/summary")
                        .headers(newcomer.headers())
                        .exchange()))
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "projectCount": 0, "totalBudget": { "amount": "0", "currency": "RWF" }, "lateProjects": 0 }
                        """);
    }
}
