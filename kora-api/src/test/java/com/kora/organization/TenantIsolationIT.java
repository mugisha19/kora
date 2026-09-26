package com.kora.organization;

import static com.kora.support.Contract.conforms;
import static com.kora.support.Contract.responseConforms;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import com.jayway.jsonpath.JsonPath;
import com.kora.platform.tenancy.TenantTransactions;
import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import jakarta.persistence.EntityManager;
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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Feature 02: no organization can ever see another's data. Two organizations, A and B, and every layer checked
 * (ADR 0007): the header check, 404 (not 403) for other tenants' ids, and PostgreSQL row-level security catching a
 * query that forgot the tenant filter altogether.
 */
@IntegrationTest
class TenantIsolationIT {

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    @Autowired
    private TenantTransactions transactions;

    @Autowired
    private PlatformTransactionManager transactionManager;

    @Autowired
    private EntityManager entityManager;

    private Session adminA;
    private Session adminB;

    @BeforeEach
    void setUp() {
        TestAccounts accounts = new TestAccounts(mvc, emails);
        adminA = accounts.registerOrganization();
        adminB = accounts.registerOrganization();
        accounts.join(adminB, Role.MEMBER);
    }

    @Nested
    class TheOrganizationHeader {

        @Test
        void namingAnotherOrganizationIsForbidden() {
            Session intruder = adminA.in(adminB.organizationId());

            for (String path : new String[] {"/api/v1/organization", "/api/v1/members", "/api/v1/invitations"}) {
                assertThat(conforms(
                                mvc.get().uri(path).headers(intruder.headers()).exchange()))
                        .hasStatus(HttpStatus.FORBIDDEN)
                        .bodyJson()
                        .extractingPath("$.code")
                        .isEqualTo("tenant.forbidden");
            }
        }

        @Test
        void aNonExistentOrganizationLooksExactlyLikeSomeoneElses() {
            assertThat(conforms(mvc.get()
                            .uri("/api/v1/organization")
                            .headers(adminA.in(UUID.randomUUID()).headers())
                            .exchange()))
                    .hasStatus(HttpStatus.FORBIDDEN)
                    .bodyJson()
                    .extractingPath("$.code")
                    .isEqualTo("tenant.forbidden");
        }

        @Test
        void mustBeAUuid() {
            HttpHeaders headers = adminA.authorization();
            headers.set("X-Organization-Id", "akagera");

            assertThat(responseConforms(mvc.get()
                            .uri("/api/v1/organization")
                            .headers(headers)
                            .exchange()))
                    .hasStatus(HttpStatus.BAD_REQUEST)
                    .bodyJson()
                    .extractingPath("$.code")
                    .isEqualTo("tenant.header_invalid");
        }

        @Test
        void isRequiredOnTenantScopedEndpoints() {
            assertThat(responseConforms(mvc.get()
                            .uri("/api/v1/members")
                            .headers(adminA.authorization())
                            .exchange()))
                    .hasStatus(HttpStatus.BAD_REQUEST)
                    .bodyJson()
                    .extractingPath("$.code")
                    .isEqualTo("tenant.header_invalid");
        }
    }

    @Nested
    class OtherTenantsIds {

        @Test
        void areNotFoundRatherThanForbidden() {
            String memberOfB = firstMembershipId(adminB, "MEMBER");
            String invitationOfB = JsonPath.read(
                    TestAccounts.body(mvc.post()
                            .uri("/api/v1/invitations")
                            .headers(adminB.headers())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"email\":\"%s\",\"role\":\"MEMBER\"}".formatted(TestAccounts.uniqueEmail("b")))
                            .exchange()),
                    "$.id");

            MvcTestResult changeRole = mvc.patch()
                    .uri("/api/v1/members/{id}", memberOfB)
                    .headers(adminA.headers())
                    .header(HttpHeaders.IF_MATCH, "\"0\"")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"role\":\"ORG_ADMIN\"}")
                    .exchange();
            MvcTestResult removeMember = mvc.delete()
                    .uri("/api/v1/members/{id}", memberOfB)
                    .headers(adminA.headers())
                    .exchange();
            MvcTestResult revokeInvitation = mvc.delete()
                    .uri("/api/v1/invitations/{id}", invitationOfB)
                    .headers(adminA.headers())
                    .exchange();

            for (MvcTestResult attempt : new MvcTestResult[] {changeRole, removeMember, revokeInvitation}) {
                assertThat(conforms(attempt))
                        .hasStatus(HttpStatus.NOT_FOUND)
                        .bodyJson()
                        .extractingPath("$.code")
                        .isEqualTo("resource.not_found");
            }
            assertThat(firstMembershipId(adminB, "MEMBER"))
                    .as("B's member is untouched")
                    .isEqualTo(memberOfB);
        }

        @Test
        void neverAppearInLists() {
            assertThat(mvc.get().uri("/api/v1/members").headers(adminA.headers()))
                    .bodyJson()
                    .extractingPath("$.totalElements")
                    .isEqualTo(1);
        }
    }

    @Nested
    class RowLevelSecurity {

        private static final String COUNT_MEMBERSHIPS = "select count(*) from memberships";

        @Test
        void aQueryWithoutAnyTenantScopeSeesNothing() {
            // Native SQL bypasses Hibernate's @TenantId filter entirely: this is the "forgot the filter" case.
            long visible = new TransactionTemplate(transactionManager).execute(status -> countMemberships());

            assertThat(visible).isZero();
        }

        @Test
        void aQueryInOneOrganizationSeesOnlyThatOrganization() {
            long inA = transactions.readInOrganization(adminA.organizationId(), this::countMemberships);
            long inB = transactions.readInOrganization(adminB.organizationId(), this::countMemberships);

            assertThat(inA).isEqualTo(1);
            assertThat(inB).isEqualTo(2);
        }

        @Test
        void writesIntoAnotherOrganizationAreRejectedByTheDatabase() {
            Throwable thrown = catchThrowable(() -> transactions.inOrganization(
                    adminA.organizationId(),
                    () -> entityManager
                            .createNativeQuery("""
                                    insert into memberships
                                      (id, organization_id, user_id, member_email, member_name, role, joined_at, version)
                                    values (gen_random_uuid(), ?1, ?2, 'x@example.com', 'X', 'ORG_ADMIN', now(), 0)
                                    """)
                            .setParameter(1, adminB.organizationId())
                            .setParameter(2, adminA.userId())
                            .executeUpdate()));

            assertThat(thrown).hasStackTraceContaining("row-level security");
        }

        private long countMemberships() {
            return ((Number) entityManager.createNativeQuery(COUNT_MEMBERSHIPS).getSingleResult()).longValue();
        }
    }

    private String firstMembershipId(Session admin, String role) {
        String body = TestAccounts.body(mvc.get()
                .uri("/api/v1/members?role=" + role)
                .headers(admin.headers())
                .exchange());
        return JsonPath.read(body, "$.content[0].id");
    }
}
