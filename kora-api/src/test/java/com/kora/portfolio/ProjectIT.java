package com.kora.portfolio;

import static com.kora.support.Contract.conforms;
import static com.kora.support.Contract.responseConforms;
import static com.kora.support.TestPortfolios.etag;
import static com.kora.support.TestPortfolios.read;
import static org.assertj.core.api.Assertions.assertThat;

import com.kora.organization.Role;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import com.kora.support.TestPortfolios;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/** Feature 04: projects, their visibility, lifecycle, team and health override. */
@IntegrationTest
class ProjectIT {

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
    void aProjectManagerCreatesAProposedProjectWithADraftCharter() {
        String code = TestPortfolios.code();
        MvcTestResult created = portfolios.createProject(
                manager, portfolioId, code, LocalDate.of(2026, 10, 1), LocalDate.of(2027, 3, 31), "150000000");

        assertThat(created).hasStatus(HttpStatus.CREATED).bodyJson().isLenientlyEqualTo("""
                        { "code": "%s", "status": "PROPOSED", "allowedTransitions": ["CANCELLED"],
                          "manager": { "userId": "%s" }, "budget": { "amount": "150000000", "currency": "RWF" },
                          "health": "GREY", "healthReason": "Not started", "healthOverridden": false }
                        """.formatted(
                        code, manager.userId()));
        assertThat(conforms(mvc.get()
                        .uri("/api/v1/projects/{id}/charter", read(created, "$.id"))
                        .headers(manager.headers())
                        .exchange()))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "versionNumber": 1, "status": "DRAFT", "objectives": [] }
                        """);
    }

    @Test
    void validatesCodeDatesAndBudget() {
        String code = TestPortfolios.code();
        portfolios.createProject(
                manager, portfolioId, code, LocalDate.now(), LocalDate.now().plusDays(10), null);

        assertThat(portfolios.createProject(
                        manager,
                        portfolioId,
                        code,
                        LocalDate.now(),
                        LocalDate.now().plusDays(10),
                        null))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "code": "projects.code_taken", "errors": [{ "field": "code" }] }
                        """);
        assertThat(portfolios.createProject(
                        manager, portfolioId, TestPortfolios.code(), LocalDate.now(), LocalDate.now(), null))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("targetEndDate");
        assertThat(responseConforms(mvc.post()
                        .uri("/api/v1/projects")
                        .headers(manager.headers())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"code":"%s","name":"Dollars","portfolioId":"%s","methodology":"AGILE",
                                 "startDate":"2026-10-01","targetEndDate":"2026-12-01",
                                 "budget":{"amount":"1000","currency":"USD"}}
                                """.formatted(TestPortfolios.code(), portfolioId))
                        .exchange()))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("budget.currency");
    }

    @Test
    void membersSeeOnlyTheProjectsTheyAreOn() {
        String projectId = portfolios.project(manager, portfolioId);
        Session member = accounts.join(admin, Role.MEMBER);

        assertThat(mvc.get().uri("/api/v1/projects/{id}", projectId).headers(member.headers()))
                .hasStatus(HttpStatus.NOT_FOUND);
        assertThat(conforms(mvc.get()
                        .uri("/api/v1/projects")
                        .headers(member.headers())
                        .exchange()))
                .bodyJson()
                .extractingPath("$.totalElements")
                .isEqualTo(0);

        assertThat(portfolios.addToTeam(manager, projectId, member.userId(), "CONTRIBUTOR"))
                .hasStatusOk();

        assertThat(mvc.get().uri("/api/v1/projects/{id}", projectId).headers(member.headers()))
                .hasStatusOk();
        assertThat(conforms(mvc.get()
                        .uri("/api/v1/projects/{id}/members", projectId)
                        .headers(member.headers())
                        .exchange()))
                .bodyJson()
                .extractingPath("$[*].projectRole")
                .asArray()
                .containsExactly("MANAGER", "CONTRIBUTOR");
        assertThat(conforms(mvc.get()
                        .uri("/api/v1/projects")
                        .headers(admin.headers())
                        .exchange()))
                .as("PMO and admins see every project")
                .bodyJson()
                .extractingPath("$.totalElements")
                .isEqualTo(1);
    }

    @Test
    void theManagerIsNotATeamRole() {
        String projectId = portfolios.project(manager, portfolioId);

        assertThat(conforms(mvc.delete()
                        .uri("/api/v1/projects/{id}/members/{userId}", projectId, manager.userId())
                        .headers(manager.headers())
                        .exchange()))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("project_members.is_manager");
        assertThat(portfolios.addToTeam(manager, projectId, UUID.randomUUID(), "OBSERVER"))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("userId");
    }

    @Test
    void theLifecycleIsEnforcedAndApprovalNeedsTheCharter() {
        String projectId = portfolios.project(manager, portfolioId);

        assertThat(portfolios.transition(manager, projectId, "APPROVED", null))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("projects.charter_approval_required");
        assertThat(portfolios.transition(manager, projectId, "IN_PROGRESS", null))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("projects.invalid_transition");

        portfolios.start(manager, admin, projectId);

        assertThat(portfolios.transition(manager, projectId, "ON_HOLD", null))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("reason");
        assertThat(portfolios.transition(manager, projectId, "ON_HOLD", "Waiting for the regulator"))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "status": "ON_HOLD", "allowedTransitions": ["IN_PROGRESS", "CANCELLED"] }
                        """);
    }

    @Test
    void theMethodologyIsLockedOnceApproved() {
        String projectId = portfolios.project(manager, portfolioId);
        portfolios.start(manager, admin, projectId);
        MvcTestResult current = mvc.get()
                .uri("/api/v1/projects/{id}", projectId)
                .headers(manager.headers())
                .exchange();

        assertThat(conforms(mvc.patch()
                        .uri("/api/v1/projects/{id}", projectId)
                        .headers(manager.headers())
                        .header(HttpHeaders.IF_MATCH, etag(current))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"methodology\":\"PREDICTIVE\"}")
                        .exchange()))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("projects.methodology_locked");
    }

    @Test
    void aManagerOverridesHealthWithAReasonAndCanClearIt() {
        String projectId = portfolios.project(manager, portfolioId);

        assertThat(conforms(mvc.put()
                        .uri("/api/v1/projects/{id}/health-override", projectId)
                        .headers(manager.headers())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"health\":\"RED\",\"reason\":\"Vendor went bankrupt\"}")
                        .exchange()))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "health": "RED", "healthReason": "Vendor went bankrupt", "healthOverridden": true }
                        """);
        assertThat(conforms(mvc.get()
                        .uri("/api/v1/projects?health=RED")
                        .headers(manager.headers())
                        .exchange()))
                .bodyJson()
                .extractingPath("$.totalElements")
                .isEqualTo(1);
        assertThat(conforms(mvc.delete()
                        .uri("/api/v1/projects/{id}/health-override", projectId)
                        .headers(manager.headers())
                        .exchange()))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "health": "GREY", "healthOverridden": false }
                        """);
    }

    @Test
    void budgetsLockTheOrganizationCurrency() {
        MvcTestResult organization =
                mvc.get().uri("/api/v1/organization").headers(admin.headers()).exchange();
        portfolios.project(admin, portfolioId, LocalDate.now(), LocalDate.now().plusDays(30), "5000000");

        assertThat(conforms(mvc.patch()
                        .uri("/api/v1/organization")
                        .headers(admin.headers())
                        .header(HttpHeaders.IF_MATCH, etag(organization))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currency\":\"USD\"}")
                        .exchange()))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("organization.currency_locked");
    }

    @Test
    void anotherOrganizationsProjectDoesNotExist() {
        String projectId = portfolios.project(manager, portfolioId);
        Session stranger = accounts.registerOrganization();

        for (String path :
                new String[] {"/api/v1/projects/{id}", "/api/v1/projects/{id}/charter", "/api/v1/projects/{id}/wbs"}) {
            assertThat(conforms(mvc.get()
                            .uri(path, projectId)
                            .headers(stranger.headers())
                            .exchange()))
                    .hasStatus(HttpStatus.NOT_FOUND);
        }
    }
}
