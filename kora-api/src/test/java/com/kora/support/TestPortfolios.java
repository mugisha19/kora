package com.kora.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.kora.support.TestAccounts.Session;
import java.time.LocalDate;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/** Creates portfolios and projects through the real endpoints, like {@link TestAccounts} does for people. */
public final class TestPortfolios {

    private final MockMvcTester mvc;

    public TestPortfolios(MockMvcTester mvc) {
        this.mvc = mvc;
    }

    /** A unique project code matching {@code [A-Z][A-Z0-9-]{1,14}}. */
    public static String code() {
        return "P"
                + UUID.randomUUID().toString().replace("-", "").substring(0, 9).toUpperCase(Locale.ROOT);
    }

    public static String read(MvcTestResult result, String jsonPath) {
        Object value = JsonPath.read(TestAccounts.body(result), jsonPath);
        return String.valueOf(value);
    }

    /** The ETag of a response, ready to send back as If-Match. */
    public static String etag(MvcTestResult result) {
        return result.getResponse().getHeader(HttpHeaders.ETAG);
    }

    public String portfolio(Session governor) {
        MvcTestResult result = Contract.conforms(mvc.post()
                .uri("/api/v1/portfolios")
                .headers(governor.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Portfolio %s\",\"strategicObjectives\":[\"Grow digital channels\"]}"
                        .formatted(UUID.randomUUID().toString().substring(0, 8)))
                .exchange());
        assertThat(result).hasStatus(HttpStatus.CREATED);
        return read(result, "$.id");
    }

    /** An Agile project running from today for three months, without budget. */
    public String project(Session creator, String portfolioId) {
        return project(creator, portfolioId, LocalDate.now(), LocalDate.now().plusMonths(3), null);
    }

    public String project(Session creator, String portfolioId, LocalDate start, LocalDate end, String budget) {
        MvcTestResult result = createProject(creator, portfolioId, code(), start, end, budget);
        assertThat(result).hasStatus(HttpStatus.CREATED);
        return read(result, "$.id");
    }

    public MvcTestResult createProject(
            Session creator, String portfolioId, String code, LocalDate start, LocalDate end, String budget) {
        String budgetJson =
                budget == null ? "" : ",\"budget\":{\"amount\":\"%s\",\"currency\":\"RWF\"}".formatted(budget);
        return Contract.conforms(mvc.post()
                .uri("/api/v1/projects")
                .headers(creator.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"code":"%s","name":"Project %s","portfolioId":"%s","methodology":"AGILE",
                         "startDate":"%s","targetEndDate":"%s"%s}
                        """.formatted(code, code, portfolioId, start, end, budgetJson))
                .exchange());
    }

    /** Fills the draft with what a submission needs, naming {@code sponsor}, and submits it. */
    public void submitCharter(Session manager, String projectId, UUID sponsor) {
        MvcTestResult charter = mvc.get()
                .uri("/api/v1/projects/{id}/charter", projectId)
                .headers(manager.headers())
                .exchange();
        assertThat(Contract.conforms(mvc.put()
                        .uri("/api/v1/projects/{id}/charter", projectId)
                        .headers(manager.headers())
                        .header(HttpHeaders.IF_MATCH, etag(charter))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"purpose":"Serve customers on mobile",
                                 "objectives":[{"text":"10,000 users in 6 months","successMetric":"Monthly active users"}],
                                 "milestones":[{"name":"Beta","targetDate":"%s"}],
                                 "sponsorId":"%s"}
                                """.formatted(LocalDate.now().plusMonths(1), sponsor))
                        .exchange()))
                .hasStatusOk();
        assertThat(Contract.conforms(mvc.post()
                        .uri("/api/v1/projects/{id}/charter/submit", projectId)
                        .headers(manager.headers())
                        .exchange()))
                .hasStatusOk();
    }

    /** Takes a new project to IN_PROGRESS: charter submitted by the manager, approved by {@code approver}. */
    public void start(Session manager, Session approver, String projectId) {
        submitCharter(manager, projectId, approver.userId());
        assertThat(mvc.post()
                        .uri("/api/v1/projects/{id}/charter/approve", projectId)
                        .headers(approver.headers()))
                .hasStatusOk();
        assertThat(transition(manager, projectId, "IN_PROGRESS", null)).hasStatusOk();
    }

    public MvcTestResult transition(Session session, String projectId, String to, String reason) {
        String reasonJson = reason == null ? "" : ",\"reason\":\"%s\"".formatted(reason);
        return Contract.conforms(mvc.post()
                .uri("/api/v1/projects/{id}/transitions", projectId)
                .headers(session.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"to\":\"%s\"%s}".formatted(to, reasonJson))
                .exchange());
    }

    public MvcTestResult addToTeam(Session manager, String projectId, UUID userId, String role) {
        return Contract.conforms(mvc.put()
                .uri("/api/v1/projects/{id}/members/{userId}", projectId, userId)
                .headers(manager.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"projectRole\":\"%s\"}".formatted(role))
                .exchange());
    }
}
