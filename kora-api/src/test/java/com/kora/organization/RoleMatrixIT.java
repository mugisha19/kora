package com.kora.organization;

import static com.kora.support.Contract.conforms;
import static org.assertj.core.api.Assertions.assertThat;

import com.kora.support.IntegrationTest;
import com.kora.support.RecordingEmailSender;
import com.kora.support.TestAccounts;
import com.kora.support.TestAccounts.Session;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.BiFunction;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

/**
 * Feature 03: one test per role per endpoint. Allowed callers aim at harmless targets (a random id, a stale
 * version), so they get 404 or 412 instead of changing anything; denied callers must get 403 before any lookup.
 */
@IntegrationTest
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class RoleMatrixIT {

    private static final Set<Role> EVERYONE = Set.of(Role.values());
    private static final Set<Role> ADMIN_ONLY = Set.of(Role.ORG_ADMIN);

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private RecordingEmailSender emails;

    private final Map<Role, Session> sessions = new EnumMap<>(Role.class);

    @BeforeAll
    void createOneMemberPerRole() {
        TestAccounts accounts = new TestAccounts(mvc, emails);
        Session admin = accounts.registerOrganization();
        sessions.put(Role.ORG_ADMIN, admin);
        for (Role role : Role.values()) {
            if (role != Role.ORG_ADMIN) {
                sessions.put(role, accounts.join(admin, role));
            }
        }
    }

    enum Endpoint {
        GET_ORGANIZATION(
                EVERYONE,
                HttpStatus.OK,
                (mvc, session) -> mvc.get()
                        .uri("/api/v1/organization")
                        .headers(session.headers())
                        .exchange()),
        UPDATE_ORGANIZATION(
                ADMIN_ONLY,
                HttpStatus.PRECONDITION_FAILED,
                (mvc, session) -> mvc.patch()
                        .uri("/api/v1/organization")
                        .headers(session.headers())
                        .header(HttpHeaders.IF_MATCH, "\"999\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Renamed Org\"}")
                        .exchange()),
        LIST_MEMBERS(
                EVERYONE,
                HttpStatus.OK,
                (mvc, session) -> mvc.get()
                        .uri("/api/v1/members")
                        .headers(session.headers())
                        .exchange()),
        CHANGE_MEMBER_ROLE(
                ADMIN_ONLY,
                HttpStatus.NOT_FOUND,
                (mvc, session) -> mvc.patch()
                        .uri("/api/v1/members/{id}", UUID.randomUUID())
                        .headers(session.headers())
                        .header(HttpHeaders.IF_MATCH, "\"0\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"MEMBER\"}")
                        .exchange()),
        REMOVE_MEMBER(
                ADMIN_ONLY,
                HttpStatus.NOT_FOUND,
                (mvc, session) -> mvc.delete()
                        .uri("/api/v1/members/{id}", UUID.randomUUID())
                        .headers(session.headers())
                        .exchange()),
        LIST_INVITATIONS(
                ADMIN_ONLY,
                HttpStatus.OK,
                (mvc, session) -> mvc.get()
                        .uri("/api/v1/invitations")
                        .headers(session.headers())
                        .exchange()),
        CREATE_INVITATION(
                ADMIN_ONLY,
                HttpStatus.CREATED,
                (mvc, session) -> mvc.post()
                        .uri("/api/v1/invitations")
                        .headers(session.headers())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"role\":\"VIEWER\"}".formatted(TestAccounts.uniqueEmail("matrix")))
                        .exchange()),
        REVOKE_INVITATION(
                ADMIN_ONLY,
                HttpStatus.NOT_FOUND,
                (mvc, session) -> mvc.delete()
                        .uri("/api/v1/invitations/{id}", UUID.randomUUID())
                        .headers(session.headers())
                        .exchange());

        private final Set<Role> allowed;
        private final HttpStatus whenAllowed;
        private final BiFunction<MockMvcTester, Session, MvcTestResult> call;

        Endpoint(Set<Role> allowed, HttpStatus whenAllowed, BiFunction<MockMvcTester, Session, MvcTestResult> call) {
            this.allowed = allowed;
            this.whenAllowed = whenAllowed;
            this.call = call;
        }
    }

    static Stream<Arguments> everyRoleOnEveryEndpoint() {
        return Arrays.stream(Endpoint.values())
                .flatMap(endpoint -> Arrays.stream(Role.values()).map(role -> Arguments.of(endpoint, role)));
    }

    @ParameterizedTest(name = "{1} on {0}")
    @MethodSource("everyRoleOnEveryEndpoint")
    void rolesAreEnforcedByTheApi(Endpoint endpoint, Role role) {
        MvcTestResult result = conforms(endpoint.call.apply(mvc, sessions.get(role)));

        if (endpoint.allowed.contains(role)) {
            assertThat(result).hasStatus(endpoint.whenAllowed);
        } else {
            assertThat(result)
                    .hasStatus(HttpStatus.FORBIDDEN)
                    .bodyJson()
                    .extractingPath("$.code")
                    .isEqualTo("access.denied");
        }
    }
}
