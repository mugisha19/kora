package com.kora.governance;

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

/** Feature 12: the issue log, its lifecycle and its filters. */
@IntegrationTest
class IssueIT {

    private static final LocalDate TODAY = LocalDate.now(ZoneId.of("Africa/Kigali"));

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
    void theOwnerResolvesWithAResolutionAndTheManagerClosesAndReopens() {
        String issue = read(
                raise(
                        contributor,
                        "Build server down",
                        "CRITICAL",
                        ",\"ownerId\":\"%s\"".formatted(contributor.userId())),
                "$.id");

        assertThat(responseConforms(post("/api/v1/issues/" + issue + "/resolve", contributor, "{}")))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .extractingPath("$.errors[0].field")
                .isEqualTo("resolution");
        assertThat(conforms(post("/api/v1/issues/" + issue + "/resolve", contributor, "{\"resolution\":\"New disk\"}")))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("{\"status\":\"RESOLVED\",\"resolution\":\"New disk\"}");
        assertThat(conforms(post("/api/v1/issues/" + issue + "/close", contributor, "")))
                .hasStatus(HttpStatus.FORBIDDEN);
        assertThat(conforms(post("/api/v1/issues/" + issue + "/close", manager, "")))
                .hasStatusOk();
        assertThat(conforms(post("/api/v1/issues/" + issue + "/close", manager, "")))
                .hasStatus(HttpStatus.CONFLICT)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("issues.invalid_transition");
        assertThat(conforms(post("/api/v1/issues/" + issue + "/reopen", manager, "{\"reason\":\"Failed again\"}")))
                .hasStatusOk()
                .bodyJson()
                .extractingPath("$.status")
                .isEqualTo("OPEN");
    }

    @Test
    void patchOnlyMovesBetweenOpenAndInProgress() {
        MvcTestResult created = raise(manager, "Vendor late", "HIGH", "");
        String issue = read(created, "$.id");

        MvcTestResult started = patch(issue, etag(created), "{\"status\":\"IN_PROGRESS\"}");
        assertThat(started).hasStatusOk().bodyJson().extractingPath("$.status").isEqualTo("IN_PROGRESS");
        assertThat(responseConforms(mvc.patch()
                        .uri("/api/v1/issues/{id}", issue)
                        .headers(manager.headers())
                        .header(HttpHeaders.IF_MATCH, etag(started))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"RESOLVED\"}")
                        .exchange()))
                .hasStatus(HttpStatus.BAD_REQUEST);
    }

    @Test
    void theListFiltersOverdueIssuesAndPutsTheMostUrgentFirst() {
        raise(manager, "Low and late", "LOW", ",\"dueDate\":\"%s\"".formatted(TODAY.minusDays(2)));
        raise(manager, "Critical", "CRITICAL", "");
        raise(manager, "Medium, due later", "MEDIUM", ",\"dueDate\":\"%s\"".formatted(TODAY.plusDays(5)));

        assertThat(conforms(get("/api/v1/projects/" + projectId + "/issues")))
                .bodyJson()
                .extractingPath("$.content[*].title")
                .isEqualTo(List.of("Critical", "Medium, due later", "Low and late"));
        assertThat(conforms(get("/api/v1/projects/" + projectId + "/issues?overdue=true")))
                .bodyJson()
                .isLenientlyEqualTo(
                        "{\"totalElements\":1,\"content\":[{\"title\":\"Low and late\",\"overdue\":true}]}");
        assertThat(conforms(get("/api/v1/projects/" + projectId + "/issues?priority=CRITICAL")))
                .bodyJson()
                .isLenientlyEqualTo("{\"content\":[{\"title\":\"Critical\",\"escalated\":false}]}");
    }

    private MvcTestResult raise(Session session, String title, String priority, String extra) {
        MvcTestResult result = conforms(
                post("/api/v1/projects/" + projectId + "/issues", session, """
                {"title":"%s","type":"TECHNICAL","priority":"%s"%s}
                """.formatted(title, priority, extra)));
        assertThat(result).hasStatus(HttpStatus.CREATED);
        return result;
    }

    private MvcTestResult patch(String issue, String etag, String body) {
        return conforms(mvc.patch()
                .uri("/api/v1/issues/{id}", issue)
                .headers(manager.headers())
                .header(HttpHeaders.IF_MATCH, etag)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)
                .exchange());
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
