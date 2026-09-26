package com.kora.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.kora.organization.Role;
import jakarta.servlet.http.Cookie;
import java.io.UnsupportedEncodingException;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/**
 * Creates real accounts through the real endpoints (never by inserting rows), so every test starts from states the
 * API itself produced. Names and emails are unique per call; tests never collide with each other's data.
 */
public final class TestAccounts {

    public static final String PASSWORD = "correct-horse-staple-42";
    public static final String REFRESH_COOKIE = "kora_refresh";

    private final MockMvcTester mvc;
    private final RecordingEmailSender emails;

    public TestAccounts(MockMvcTester mvc, RecordingEmailSender emails) {
        this.mvc = mvc;
        this.emails = emails;
    }

    public static String uniqueEmail(String prefix) {
        // example.com: a real TLD, which the contract validator's RFC 5321 email check insists on.
        return prefix + "-" + UUID.randomUUID() + "@example.com";
    }

    /** A new organization with a new {@code ORG_ADMIN}, signed in. */
    public Session registerOrganization() {
        String email = uniqueEmail("admin");
        MvcTestResult result = Contract.conforms(mvc.post()
                .uri("/api/v1/auth/register-organization")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"organizationName":"Org %s","fullName":"Admin User","email":"%s","password":"%s"}
                        """.formatted(UUID.randomUUID(), email, PASSWORD))
                .exchange());
        assertThat(result).hasStatus(HttpStatus.CREATED);
        return Session.from(result, email, PASSWORD);
    }

    /** Invites a new person into the admin's organization with {@code role}, and accepts as them. */
    public Session join(Session admin, Role role) {
        String email = uniqueEmail(role.name().toLowerCase());
        assertThat(mvc.post()
                        .uri("/api/v1/invitations")
                        .headers(admin.headers())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"role\":\"%s\"}".formatted(email, role)))
                .hasStatus(HttpStatus.CREATED);
        String token = RecordingEmailSender.tokenFrom(emails.awaitEmail(email, 1), "/invitations/");
        MvcTestResult accepted = mvc.post()
                .uri("/api/v1/invitations/token/{token}/accept", token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"%s User\",\"password\":\"%s\"}".formatted(role, PASSWORD))
                .exchange();
        assertThat(accepted).hasStatusOk();
        return Session.from(accepted, email, PASSWORD).in(admin.organizationId());
    }

    public Session login(String email, String password) {
        MvcTestResult result = mvc.post()
                .uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password))
                .exchange();
        assertThat(result).hasStatusOk();
        return Session.from(result, email, password);
    }

    /**
     * A signed-in user.
     *
     * @param organizationId the organization sent as {@code X-Organization-Id} (the first membership by default)
     */
    public record Session(
            String accessToken, String refreshToken, UUID userId, UUID organizationId, String email, String password) {

        static Session from(MvcTestResult result, String email, String password) {
            String body = body(result);
            Cookie cookie = result.getResponse().getCookie(REFRESH_COOKIE);
            assertThat(cookie).as("refresh cookie").isNotNull();
            String firstOrganization = JsonPath.read(body, "$.user.memberships[0].organizationId");
            return new Session(
                    JsonPath.read(body, "$.accessToken"),
                    cookie.getValue(),
                    UUID.fromString(JsonPath.read(body, "$.user.id")),
                    UUID.fromString(firstOrganization),
                    email,
                    password);
        }

        public Session in(UUID organization) {
            return new Session(accessToken, refreshToken, userId, organization, email, password);
        }

        /** {@code Authorization} and {@code X-Organization-Id}. */
        public HttpHeaders headers() {
            HttpHeaders headers = authorization();
            headers.set("X-Organization-Id", organizationId.toString());
            return headers;
        }

        /** {@code Authorization} only, for endpoints that aren't tenant-scoped. */
        public HttpHeaders authorization() {
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(accessToken);
            return headers;
        }
    }

    public static String body(MvcTestResult result) {
        try {
            return result.getResponse().getContentAsString();
        } catch (UnsupportedEncodingException e) {
            throw new IllegalStateException(e);
        }
    }
}
