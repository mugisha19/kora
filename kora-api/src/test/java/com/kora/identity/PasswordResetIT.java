package com.kora.identity;

import static com.kora.support.Contract.conforms;
import static com.kora.support.TestAccounts.PASSWORD;
import static com.kora.support.TestAccounts.REFRESH_COOKIE;
import static com.kora.support.TestAccounts.uniqueEmail;
import static org.assertj.core.api.Assertions.assertThat;

import com.kora.platform.mail.EmailMessage;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import jakarta.servlet.http.Cookie;
import java.time.Duration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/** Feature 01: forgotten passwords, without revealing which emails have accounts. */
@IntegrationTest
class PasswordResetIT {

    private static final String NEW_PASSWORD = "a-brand-new-passphrase-7";

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private TestAccounts accounts;

    @BeforeEach
    void setUp() {
        accounts = new TestAccounts(mvc, emails);
    }

    @Test
    void answersTheSameForKnownAndUnknownEmailsButOnlyMailsAccounts() throws InterruptedException {
        Session admin = accounts.registerOrganization();
        String unknown = uniqueEmail("nobody");

        assertThat(conforms(forgot(admin.email()))).hasStatus(HttpStatus.ACCEPTED);
        assertThat(conforms(forgot(unknown))).hasStatus(HttpStatus.ACCEPTED);

        EmailMessage email = emails.awaitEmail(admin.email(), 1);
        assertThat(email.subject()).isEqualTo("Reset your Kora password");
        assertThat(email.body()).contains("http://localhost:4200/reset-password?token=");
        Thread.sleep(Duration.ofMillis(300));
        assertThat(emails.sentTo(unknown)).isEmpty();
    }

    @Test
    void resetsThePasswordOnceAndSignsOutEverywhere() {
        Session admin = accounts.registerOrganization();
        forgot(admin.email());
        String token = RecordingEmailSender.tokenFrom(emails.awaitEmail(admin.email(), 1), "token=");

        assertThat(conforms(reset(token, NEW_PASSWORD))).hasStatus(HttpStatus.NO_CONTENT);

        assertThat(accounts.login(admin.email(), NEW_PASSWORD).userId()).isEqualTo(admin.userId());
        assertThat(login(admin.email(), PASSWORD)).hasStatus(HttpStatus.UNAUTHORIZED);
        assertThat(mvc.post().uri("/api/v1/auth/refresh").cookie(new Cookie(REFRESH_COOKIE, admin.refreshToken())))
                .as("sessions from before the reset are revoked")
                .hasStatus(HttpStatus.UNAUTHORIZED);
        assertThat(conforms(reset(token, "yet-another-passphrase-8")))
                .as("the link is single-use")
                .hasStatus(HttpStatus.GONE)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("auth.reset_token_invalid");
    }

    @Test
    void anUnknownTokenIsGone() {
        assertThat(conforms(reset("x".repeat(43), NEW_PASSWORD)))
                .hasStatus(HttpStatus.GONE)
                .bodyJson()
                .extractingPath("$.code")
                .isEqualTo("auth.reset_token_invalid");
    }

    @Test
    void theNewPasswordFollowsThePolicyAndAFailedAttemptKeepsTheLinkUsable() {
        Session admin = accounts.registerOrganization();
        forgot(admin.email());
        String token = RecordingEmailSender.tokenFrom(emails.awaitEmail(admin.email(), 1), "token=");

        assertThat(conforms(reset(token, "qwertyuiop123")))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "errors": [{ "field": "newPassword", "code": "password.breached" }] }
                        """);
        assertThat(reset(token, NEW_PASSWORD)).hasStatus(HttpStatus.NO_CONTENT);
    }

    private MvcTestResult forgot(String email) {
        return mvc.post()
                .uri("/api/v1/auth/password/forgot")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\"}".formatted(email))
                .exchange();
    }

    private MvcTestResult reset(String token, String newPassword) {
        return mvc.post()
                .uri("/api/v1/auth/password/reset")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"%s\",\"newPassword\":\"%s\"}".formatted(token, newPassword))
                .exchange();
    }

    private MvcTestResult login(String email, String password) {
        return mvc.post()
                .uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password))
                .exchange();
    }
}
