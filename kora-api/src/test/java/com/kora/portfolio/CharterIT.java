package com.kora.portfolio;

import static com.kora.support.Contract.conforms;
import static com.kora.support.TestPortfolios.etag;
import static org.assertj.core.api.Assertions.assertThat;

import com.kora.organization.Role;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import com.kora.support.TestPortfolios;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/** Feature 06: drafting, submitting, returning and approving the charter, which authorizes the project. */
@IntegrationTest
class CharterIT {

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private TestPortfolios portfolios;
    private Session admin;
    private Session manager;
    private Session sponsor;
    private String projectId;

    @BeforeEach
    void setUp() {
        TestAccounts accounts = new TestAccounts(mvc, emails);
        portfolios = new TestPortfolios(mvc);
        admin = accounts.registerOrganization();
        manager = accounts.join(admin, Role.PROJECT_MANAGER);
        sponsor = accounts.join(admin, Role.MEMBER);
        projectId = portfolios.project(manager, portfolios.portfolio(admin));
    }

    @Test
    void anIncompleteDraftCantBeSubmitted() {
        assertThat(conforms(submit(manager)))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "code": "charters.incomplete",
                          "errors": [{ "field": "purpose" }, { "field": "objectives" }, { "field": "sponsorId" }] }
                        """);
    }

    @Test
    void theSponsorApprovesAndTheProjectBecomesApproved() {
        portfolios.submitCharter(manager, projectId, sponsor.userId());

        assertThat(conforms(approve(manager)))
                .as("the manager isn't the sponsor")
                .hasStatus(HttpStatus.FORBIDDEN);
        assertThat(conforms(approve(sponsor))).hasStatusOk().bodyJson().isLenientlyEqualTo("""
                        { "status": "APPROVED", "approvedBy": { "userId": "%s" },
                          "sponsor": { "userId": "%s" }, "milestones": [{ "name": "Beta" }] }
                        """.formatted(
                        sponsor.userId(), sponsor.userId()));
        assertThat(conforms(mvc.get()
                        .uri("/api/v1/projects/{id}", projectId)
                        .headers(manager.headers())
                        .exchange()))
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "status": "APPROVED", "allowedTransitions": ["IN_PROGRESS", "CANCELLED"] }
                        """);
    }

    @Test
    void theSponsorCanSeeTheProjectTheyApprove() {
        portfolios.submitCharter(manager, projectId, sponsor.userId());

        assertThat(mvc.get().uri("/api/v1/projects/{id}", projectId).headers(sponsor.headers()))
                .hasStatusOk();
    }

    @Test
    void anApprovedCharterIsReadOnly() {
        portfolios.submitCharter(manager, projectId, sponsor.userId());
        MvcTestResult approved = approve(admin);

        assertThat(conforms(mvc.put()
                        .uri("/api/v1/projects/{id}/charter", projectId)
                        .headers(manager.headers())
                        .header(HttpHeaders.IF_MATCH, etag(approved))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purpose\":\"Changed after approval\"}")
                        .exchange()))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("charters.not_draft");
    }

    @Test
    void aReturnedCharterGoesBackToDraftWithTheComment() {
        portfolios.submitCharter(manager, projectId, sponsor.userId());

        assertThat(conforms(mvc.post()
                        .uri("/api/v1/projects/{id}/charter/return", projectId)
                        .headers(sponsor.headers())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"comment\":\"Quantify the business case\"}")
                        .exchange()))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "status": "DRAFT", "returnComment": "Quantify the business case" }
                        """);
        assertThat(conforms(approve(sponsor)))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("charters.not_submitted");
        assertThat(conforms(mvc.get()
                        .uri("/api/v1/projects/{id}/charter/versions", projectId)
                        .headers(manager.headers())
                        .exchange()))
                .bodyJson()
                .extractingPath("$[*].versionNumber")
                .asArray()
                .containsExactly(1);
    }

    @Test
    void editingNeedsTheCurrentVersion() {
        assertThat(conforms(mvc.put()
                        .uri("/api/v1/projects/{id}/charter", projectId)
                        .headers(manager.headers())
                        .header(HttpHeaders.IF_MATCH, "\"99\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purpose\":\"Stale edit\"}")
                        .exchange()))
                .hasStatus(HttpStatus.PRECONDITION_FAILED);
    }

    private MvcTestResult submit(Session session) {
        return mvc.post()
                .uri("/api/v1/projects/{id}/charter/submit", projectId)
                .headers(session.headers())
                .exchange();
    }

    private MvcTestResult approve(Session session) {
        return mvc.post()
                .uri("/api/v1/projects/{id}/charter/approve", projectId)
                .headers(session.headers())
                .exchange();
    }
}
