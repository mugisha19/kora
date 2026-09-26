package com.kora.identity;

import static com.kora.support.Contract.conforms;
import static com.kora.support.Contract.responseConforms;
import static com.kora.support.TestAccounts.PASSWORD;
import static com.kora.support.TestAccounts.REFRESH_COOKIE;
import static com.kora.support.TestAccounts.uniqueEmail;
import static org.assertj.core.api.Assertions.assertThat;

import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/** Feature 01: signing in, refresh rotation with reuse detection, signing out. */
@IntegrationTest
class AuthIT {

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private TestAccounts accounts;

    @BeforeEach
    void setUp() {
        accounts = new TestAccounts(mvc, emails);
    }

    @Nested
    class Registration {

        @Test
        void createsTheOrganizationAndSignsTheAdminIn() {
            String email = uniqueEmail("founder");
            MvcTestResult result = conforms(register(email, PASSWORD, "Akagera Digital Ltd"));

            assertThat(result).hasStatus(HttpStatus.CREATED).bodyJson().isLenientlyEqualTo("""
                            {
                              "tokenType": "Bearer",
                              "expiresIn": 900,
                              "user": {
                                "email": "%s",
                                "fullName": "Aline Uwase",
                                "locale": "en",
                                "memberships": [{ "role": "ORG_ADMIN" }]
                              }
                            }
                            """.formatted(email));
            assertThat(TestAccounts.body(result)).doesNotContain(REFRESH_COOKIE).doesNotContain("refreshToken");
        }

        @Test
        void derivesAUniqueSlugFromTheName() {
            String name = "Virunga Build " + UUID.randomUUID().toString().substring(0, 8);
            MvcTestResult first = register(uniqueEmail("a"), PASSWORD, name);
            MvcTestResult second = register(uniqueEmail("b"), PASSWORD, name);

            String slug = name.toLowerCase().replace(' ', '-');
            assertThat(first)
                    .bodyJson()
                    .extractingPath("$.user.memberships[0].organizationSlug")
                    .isEqualTo(slug);
            assertThat(second)
                    .bodyJson()
                    .extractingPath("$.user.memberships[0].organizationSlug")
                    .isEqualTo(slug + "-2");
        }

        @Test
        void refusesAnEmailThatAlreadyHasAnAccountCaseInsensitively() {
            String email = uniqueEmail("taken");
            register(email, PASSWORD, "First Org");

            assertThat(conforms(register(email.toUpperCase(), PASSWORD, "Second Org")))
                    .hasStatus(HttpStatus.CONFLICT)
                    .bodyJson()
                    .isLenientlyEqualTo("""
                            { "code": "auth.email_taken", "errors": [{ "field": "email" }] }
                            """);
        }

        @Test
        void refusesShortAndBreachedPasswords() {
            assertThat(responseConforms(register(uniqueEmail("short"), "short-pw", "Org")))
                    .hasStatus(HttpStatus.BAD_REQUEST)
                    .bodyJson()
                    .isLenientlyEqualTo("""
                            { "errors": [{ "field": "password", "code": "length", "params": { "min": 12, "max": 128 } }] }
                            """);
            assertThat(conforms(register(uniqueEmail("breached"), "Password1234", "Org")))
                    .hasStatus(HttpStatus.BAD_REQUEST)
                    .bodyJson()
                    .isLenientlyEqualTo("""
                            { "errors": [{ "field": "password", "code": "password.breached" }] }
                            """);
        }

        @Test
        void reportsANameThatIsTooShortOnceTrimmedOnTheRequestField() {
            assertThat(conforms(register(uniqueEmail("trim"), PASSWORD, "  a  ")))
                    .hasStatus(HttpStatus.BAD_REQUEST)
                    .bodyJson()
                    .extractingPath("$.errors[0].field")
                    .isEqualTo("organizationName");
        }

        @Test
        void validatesCurrencyAndTimeZone() {
            MvcTestResult result = mvc.post()
                    .uri("/api/v1/auth/register-organization")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""
                            {"organizationName":"Org","fullName":"A B","email":"%s","password":"%s",
                             "currency":"ZZZ","timeZone":"Mars/Olympus"}
                            """.formatted(uniqueEmail("tz"), PASSWORD))
                    .exchange();

            assertThat(result)
                    .hasStatus(HttpStatus.BAD_REQUEST)
                    .bodyJson()
                    .extractingPath("$.errors[0].field")
                    .isEqualTo("currency");
        }
    }

    @Nested
    class SigningIn {

        @Test
        void setsAHardenedRefreshCookie() {
            Session admin = accounts.registerOrganization();
            MvcTestResult result = conforms(login(admin.email(), PASSWORD));

            assertThat(result).hasStatusOk();
            String setCookie = result.getResponse().getHeader(HttpHeaders.SET_COOKIE);
            assertThat(setCookie)
                    .startsWith(REFRESH_COOKIE + "=")
                    .contains("Path=/api/v1/auth")
                    .contains("HttpOnly")
                    .contains("Secure")
                    .contains("SameSite=Strict")
                    .contains("Max-Age=1209600");
        }

        @Test
        void wrongPasswordAndUnknownEmailAreIndistinguishable() {
            Session admin = accounts.registerOrganization();

            MvcTestResult wrongPassword = conforms(login(admin.email(), "not-the-right-password"));
            MvcTestResult unknownEmail = conforms(login(uniqueEmail("nobody"), "not-the-right-password"));

            for (MvcTestResult result : new MvcTestResult[] {wrongPassword, unknownEmail}) {
                assertThat(result).hasStatus(HttpStatus.UNAUTHORIZED).bodyJson().isLenientlyEqualTo("""
                                { "code": "auth.invalid_credentials", "detail": "The email or password is incorrect" }
                                """);
            }
        }

        @Test
        void emailIsCaseInsensitive() {
            Session admin = accounts.registerOrganization();

            assertThat(login(admin.email().toUpperCase(), PASSWORD)).hasStatusOk();
        }

        @Test
        void isRateLimitedPerEmailWithRetryAfter() {
            Session admin = accounts.registerOrganization();
            for (int attempt = 0; attempt < 10; attempt++) {
                login(admin.email(), "wrong-password-" + attempt);
            }

            MvcTestResult limited = conforms(login(admin.email(), PASSWORD));

            assertThat(limited)
                    .hasStatus(HttpStatus.TOO_MANY_REQUESTS)
                    .bodyJson()
                    .extractingPath("$.code")
                    .isEqualTo("rate_limited");
            assertThat(Long.parseLong(limited.getResponse().getHeader(HttpHeaders.RETRY_AFTER)))
                    .isPositive();
        }
    }

    @Nested
    class AccessTokens {

        @Test
        void authenticateApiCalls() {
            Session admin = accounts.registerOrganization();

            assertThat(conforms(mvc.get()
                            .uri("/api/v1/me")
                            .headers(admin.authorization())
                            .exchange()))
                    .hasStatusOk()
                    .bodyJson()
                    .extractingPath("$.email")
                    .isEqualTo(admin.email());
        }

        @Test
        void missingOrInvalidTokensAre401ProblemDetails() {
            MvcTestResult missing = responseConforms(mvc.get().uri("/api/v1/me").exchange());
            MvcTestResult garbage = mvc.get()
                    .uri("/api/v1/me")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer not.a.jwt")
                    .exchange();

            for (MvcTestResult result : new MvcTestResult[] {missing, garbage}) {
                assertThat(result)
                        .hasStatus(HttpStatus.UNAUTHORIZED)
                        .hasContentType(MediaType.APPLICATION_PROBLEM_JSON)
                        .bodyJson()
                        .extractingPath("$.code")
                        .isEqualTo("auth.unauthenticated");
            }
        }

        @Test
        void areIgnoredOnPublicEndpointsSoAnExpiredOneCantBlockARefresh() {
            Session admin = accounts.registerOrganization();

            assertThat(mvc.post()
                            .uri("/api/v1/auth/refresh")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer expired.or.garbage")
                            .cookie(new Cookie(REFRESH_COOKIE, admin.refreshToken())))
                    .hasStatusOk();
        }
    }

    @Nested
    class Refreshing {

        @Test
        void rotatesTheRefreshToken() {
            Session admin = accounts.registerOrganization();

            MvcTestResult refreshed = conforms(refresh(admin.refreshToken()));

            assertThat(refreshed)
                    .hasStatusOk()
                    .bodyJson()
                    .extractingPath("$.user.id")
                    .isEqualTo(admin.userId().toString());
            String rotated = refreshed.getResponse().getCookie(REFRESH_COOKIE).getValue();
            assertThat(rotated).isNotEqualTo(admin.refreshToken());
            assertThat(refresh(rotated)).hasStatusOk();
        }

        @Test
        void reusingARotatedTokenRevokesTheWholeSession() {
            Session admin = accounts.registerOrganization();
            String successor = refresh(admin.refreshToken())
                    .getResponse()
                    .getCookie(REFRESH_COOKIE)
                    .getValue();

            assertThat(conforms(refresh(admin.refreshToken())))
                    .hasStatus(HttpStatus.UNAUTHORIZED)
                    .bodyJson()
                    .extractingPath("$.code")
                    .isEqualTo("auth.refresh_invalid");
            // The legitimate successor dies with the family: a stolen token can't outlive the theft detection.
            assertThat(refresh(successor)).hasStatus(HttpStatus.UNAUTHORIZED);
        }

        @Test
        void aMissingOrUnknownCookieIs401() {
            assertThat(responseConforms(mvc.post().uri("/api/v1/auth/refresh").exchange()))
                    .hasStatus(HttpStatus.UNAUTHORIZED);
            assertThat(refresh("unknown-token-value-that-is-long-enough")).hasStatus(HttpStatus.UNAUTHORIZED);
        }

        @Test
        void otherSignInsSurviveReuseInOneSession() {
            Session admin = accounts.registerOrganization();
            Session otherDevice = accounts.login(admin.email(), PASSWORD);
            refresh(admin.refreshToken());
            refresh(admin.refreshToken());

            assertThat(refresh(otherDevice.refreshToken())).hasStatusOk();
        }
    }

    @Nested
    class SigningOut {

        @Test
        void revokesTheSessionAndExpiresTheCookie() {
            Session admin = accounts.registerOrganization();

            MvcTestResult result = conforms(mvc.post()
                    .uri("/api/v1/auth/logout")
                    .cookie(new Cookie(REFRESH_COOKIE, admin.refreshToken()))
                    .exchange());

            assertThat(result).hasStatus(HttpStatus.NO_CONTENT);
            assertThat(result.getResponse().getHeader(HttpHeaders.SET_COOKIE))
                    .contains("Max-Age=0")
                    .contains("Path=/api/v1/auth");
            assertThat(refresh(admin.refreshToken())).hasStatus(HttpStatus.UNAUTHORIZED);
        }

        @Test
        void succeedsWithoutACookie() {
            assertThat(mvc.post().uri("/api/v1/auth/logout")).hasStatus(HttpStatus.NO_CONTENT);
        }
    }

    private MvcTestResult register(String email, String password, String organizationName) {
        return mvc.post()
                .uri("/api/v1/auth/register-organization")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {"organizationName":"%s","fullName":"Aline Uwase","email":"%s","password":"%s"}
                        """.formatted(organizationName, email, password))
                .exchange();
    }

    private MvcTestResult login(String email, String password) {
        return mvc.post()
                .uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password))
                .exchange();
    }

    private MvcTestResult refresh(String refreshToken) {
        return mvc.post()
                .uri("/api/v1/auth/refresh")
                .cookie(new Cookie(REFRESH_COOKIE, refreshToken))
                .exchange();
    }
}
