package com.kora.identity;

import static com.kora.support.Contract.conforms;
import static com.kora.support.Contract.responseConforms;
import static org.assertj.core.api.Assertions.assertThat;

import com.kora.organization.Role;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

/** Features 02 and 23: the signed-in user, their memberships, name and language. */
@IntegrationTest
class MeIT {

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
    void listsEveryMembershipForTheOrganizationSwitcher() {
        Session admin = accounts.registerOrganization();
        Session otherAdmin = accounts.registerOrganization();
        Session member = accounts.join(admin, Role.MEMBER);
        // Joining the other organization too: the same account now has two memberships with different roles.
        mvc.post()
                .uri("/api/v1/invitations")
                .headers(otherAdmin.headers())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"role\":\"PMO\"}".formatted(member.email()))
                .exchange();
        String token = RecordingEmailSender.tokenFrom(emails.awaitEmail(member.email(), 2), "/invitations/");
        mvc.post()
                .uri("/api/v1/invitations/token/{token}/accept", token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"password\":\"%s\"}".formatted(TestAccounts.PASSWORD))
                .exchange();

        assertThat(conforms(mvc.get()
                        .uri("/api/v1/me")
                        .headers(member.authorization())
                        .exchange()))
                .hasStatusOk()
                .bodyJson()
                .extractingPath("$.memberships[*].role")
                .asArray()
                .containsExactlyInAnyOrder("MEMBER", "PMO");
    }

    @Test
    void updatesNameAndLanguage() {
        Session admin = accounts.registerOrganization();

        assertThat(conforms(mvc.patch()
                        .uri("/api/v1/me")
                        .headers(admin.authorization())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fullName\":\"  Aline Uwase  \",\"locale\":\"rw\"}")
                        .exchange()))
                .hasStatusOk()
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "fullName": "Aline Uwase", "locale": "rw" }
                        """);
    }

    @Test
    void rejectsAnEmptyUpdateAndUnknownLanguages() {
        Session admin = accounts.registerOrganization();

        assertThat(responseConforms(mvc.patch()
                        .uri("/api/v1/me")
                        .headers(admin.authorization())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}")
                        .exchange()))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "errors": [{ "field": "body", "code": "required" }] }
                        """);
        assertThat(responseConforms(mvc.patch()
                        .uri("/api/v1/me")
                        .headers(admin.authorization())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"locale\":\"de\"}")
                        .exchange()))
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson()
                .isLenientlyEqualTo("""
                        { "errors": [{ "field": "locale", "code": "format" }] }
                        """);
    }
}
