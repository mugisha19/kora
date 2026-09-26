package com.kora.portfolio;

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
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/** Feature 04: portfolios and programs. */
@IntegrationTest
class PortfolioIT {

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private TestAccounts accounts;
    private TestPortfolios portfolios;
    private Session admin;

    @BeforeEach
    void setUp() {
        accounts = new TestAccounts(mvc, emails);
        portfolios = new TestPortfolios(mvc);
        admin = accounts.registerOrganization();
    }

    @Test
    void createsAndListsPortfoliosWithTheirCounts() {
        String portfolioId = portfolios.portfolio(admin);
        portfolios.project(admin, portfolioId);
        createProgram(portfolioId, admin.userId().toString());

        assertThat(conforms(mvc.get()
                        .uri("/api/v1/portfolios")
                        .headers(admin.headers())
                        .exchange()))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "totalElements": 1,
                          "content": [{ "id": "%s", "status": "ACTIVE", "programCount": 1, "projectCount": 1,
                                        "owner": { "userId": "%s", "fullName": "Admin User" } }] }
                        """.formatted(portfolioId, admin.userId()));
    }

    @Test
    void theOwnerMustGovernPortfolios() {
        Session manager = accounts.join(admin, Role.PROJECT_MANAGER);

        assertThat(conforms(mvc.post()
                        .uri("/api/v1/portfolios")
                        .headers(admin.headers())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Owned by a PM\",\"ownerId\":\"%s\"}".formatted(manager.userId()))
                        .exchange()))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("ownerId");
    }

    @Test
    void anArchivedPortfolioIsReadOnlyUntilReactivated() {
        String portfolioId = portfolios.portfolio(admin);
        MvcTestResult archived = update(portfolioId, etagOf(portfolioId), "{\"status\":\"ARCHIVED\"}");
        assertThat(archived).hasStatusOk().bodyJson().extractingPath("$.status").isEqualTo("ARCHIVED");

        assertThat(conforms(update(portfolioId, etag(archived), "{\"name\":\"Renamed\"}")))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("portfolios.archived");
        assertThat(conforms(createProgram(portfolioId, admin.userId().toString())))
                .hasStatus(HttpStatus.CONFLICT);
        assertThat(portfolios.createProject(
                        admin,
                        portfolioId,
                        TestPortfolios.code(),
                        LocalDate.now(),
                        LocalDate.now().plusDays(30),
                        null))
                .hasStatus(HttpStatus.CONFLICT);

        assertThat(update(portfolioId, etag(archived), "{\"status\":\"ACTIVE\",\"name\":\"Back\"}"))
                .hasStatusOk()
                .bodyJson()
                .extractingPath("$.name")
                .isEqualTo("Back");
    }

    @Test
    void onlyAnEmptyPortfolioCanBeDeleted() {
        String used = portfolios.portfolio(admin);
        portfolios.project(admin, used);
        String empty = portfolios.portfolio(admin);

        assertThat(conforms(mvc.delete()
                        .uri("/api/v1/portfolios/{id}", used)
                        .headers(admin.headers())
                        .exchange()))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("portfolios.not_empty");
        assertThat(conforms(mvc.delete()
                        .uri("/api/v1/portfolios/{id}", empty)
                        .headers(admin.headers())
                        .exchange()))
                .hasStatus(HttpStatus.NO_CONTENT);
        assertThat(mvc.get().uri("/api/v1/portfolios/{id}", empty).headers(admin.headers()))
                .hasStatus(HttpStatus.NOT_FOUND);
    }

    @Test
    void programsBelongToAPortfolioAndNeedAnEligibleManager() {
        String portfolioId = portfolios.portfolio(admin);
        Session member = accounts.join(admin, Role.MEMBER);

        assertThat(conforms(createProgram(portfolioId, member.userId().toString())))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("managerId");
        MvcTestResult created =
                conforms(createProgram(portfolioId, admin.userId().toString()));
        assertThat(created).hasStatus(HttpStatus.CREATED);

        assertThat(conforms(mvc.get()
                        .uri("/api/v1/portfolios/{id}/programs", portfolioId)
                        .headers(member.headers())
                        .exchange()))
                .hasStatusOk()
                .bodyJson()
                .extractingPath("$[0].id")
                .isEqualTo(read(created, "$.id"));
        assertThat(conforms(mvc.patch()
                        .uri("/api/v1/programs/{id}", read(created, "$.id"))
                        .headers(admin.headers())
                        .header(HttpHeaders.IF_MATCH, etag(created))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"CLOSED\"}")
                        .exchange()))
                .hasStatusOk()
                .bodyJson()
                .extractingPath("$.status")
                .isEqualTo("CLOSED");
    }

    private MvcTestResult createProgram(String portfolioId, String managerId) {
        return mvc.post()
                .uri("/api/v1/portfolios/{id}/programs", portfolioId)
                .headers(admin.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Customer channels\",\"managerId\":\"%s\"}".formatted(managerId))
                .exchange();
    }

    private MvcTestResult update(String portfolioId, String ifMatch, String body) {
        return mvc.patch()
                .uri("/api/v1/portfolios/{id}", portfolioId)
                .headers(admin.headers())
                .header(HttpHeaders.IF_MATCH, ifMatch)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .exchange();
    }

    private String etagOf(String portfolioId) {
        return etag(mvc.get()
                .uri("/api/v1/portfolios/{id}", portfolioId)
                .headers(admin.headers())
                .exchange());
    }
}
