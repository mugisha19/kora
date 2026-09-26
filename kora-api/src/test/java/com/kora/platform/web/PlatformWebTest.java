package com.kora.platform.web;

import static org.assertj.core.api.Assertions.assertThat;

import com.kora.platform.error.ConflictException;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.OptimisticLock;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The platform's HTTP conventions (ADR 0005) exercised through the real Spring MVC stack: filters, argument
 * resolvers, validation and the Problem Details handler. A probe controller that exists only in tests triggers
 * each kind of failure. No database or Docker needed.
 */
@WebMvcTest(
        controllers = PlatformWebTest.ProbeController.class,
        // The tenant filter needs the organization module's services, which a web slice doesn't load.
        excludeFilters = @ComponentScan.Filter(type = FilterType.REGEX, pattern = "com\\.kora\\.organization\\..*"))
@Import(PlatformWebTest.OpenSecurity.class)
class PlatformWebTest {

    /** Authentication is not what this slice tests (see AuthIT); every probe endpoint is open. */
    @TestConfiguration(proxyBeanMethods = false)
    static class OpenSecurity {

        @Bean
        SecurityFilterChain openForProbes(HttpSecurity http) {
            return http.csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(authorize -> authorize.anyRequest().permitAll())
                    .build();
        }
    }

    @Autowired
    private MockMvcTester mvc;

    @Nested
    class ProblemDetailsShape {

        @Test
        void koraProblemsCarryCodeTypeInstanceAndCorrelationId() {
            MvcTestResult result = mvc.get().uri("/probe/missing").exchange();

            assertThat(result)
                    .hasStatus(HttpStatus.NOT_FOUND)
                    .hasContentType(MediaType.APPLICATION_PROBLEM_JSON)
                    .bodyJson()
                    .isLenientlyEqualTo("""
                            {
                              "type": "urn:kora:problem:resource.not_found",
                              "title": "Not Found",
                              "status": 404,
                              "detail": "Widget 42 was not found",
                              "instance": "/probe/missing",
                              "code": "resource.not_found"
                            }
                            """);
            assertThat(result)
                    .bodyJson()
                    .extractingPath("$.correlationId")
                    .isEqualTo(result.getResponse().getHeader(CorrelationId.HEADER));
        }

        @Test
        void domainConflictsKeepTheirOwnCodeAndFieldErrors() {
            assertThat(mvc.get().uri("/probe/conflict"))
                    .hasStatus(HttpStatus.CONFLICT)
                    .bodyJson()
                    .isLenientlyEqualTo("""
                            {
                              "type": "urn:kora:problem:invitations.already_member",
                              "code": "invitations.already_member",
                              "errors": [{ "field": "email", "code": "invitations.already_member" }]
                            }
                            """);
        }

        @Test
        void unexpectedExceptionsBecomeAGeneric500WithoutInternalDetails() {
            MvcTestResult result = mvc.get().uri("/probe/boom").exchange();

            assertThat(result)
                    .hasStatus(HttpStatus.INTERNAL_SERVER_ERROR)
                    .bodyJson()
                    .isLenientlyEqualTo("""
                            { "code": "internal.error", "detail": "An unexpected error occurred" }
                            """);
            assertThat(result).bodyText().doesNotContain("secret");
        }

        @Test
        void unknownPathsAre404ResourceNotFound() {
            assertThat(mvc.get().uri("/probe/does-not-exist"))
                    .hasStatus(HttpStatus.NOT_FOUND)
                    .bodyJson()
                    .extractingPath("$.code")
                    .isEqualTo("resource.not_found");
        }

        @Test
        void wrongMethodIs405MethodNotAllowed() {
            assertThat(mvc.delete().uri("/probe/missing"))
                    .hasStatus(HttpStatus.METHOD_NOT_ALLOWED)
                    .bodyJson()
                    .extractingPath("$.code")
                    .isEqualTo("method.not_allowed");
        }

        @Test
        void wrongContentTypeIs415MediaTypeUnsupported() {
            assertThat(mvc.post()
                            .uri("/probe/body")
                            .contentType(MediaType.TEXT_PLAIN)
                            .content("hello"))
                    .hasStatus(HttpStatus.UNSUPPORTED_MEDIA_TYPE)
                    .bodyJson()
                    .extractingPath("$.code")
                    .isEqualTo("media_type.unsupported");
        }
    }

    @Nested
    class Validation {

        @Test
        void beanValidationFailuresListEveryFieldWithAGenericCodeAndBounds() {
            assertThat(mvc.post()
                            .uri("/probe/body")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    { "name": "x", "email": "not-an-email" }
                                    """))
                    .hasStatus(HttpStatus.BAD_REQUEST)
                    .bodyJson()
                    .isLenientlyEqualTo("""
                            {
                              "code": "validation.failed",
                              "errors": [
                                { "field": "email", "code": "email" },
                                { "field": "name", "code": "length", "params": { "min": 2, "max": 10 } }
                              ]
                            }
                            """);
        }

        @Test
        void missingRequiredFieldsAreReportedAsRequired() {
            assertThat(mvc.post()
                            .uri("/probe/body")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .hasStatus(HttpStatus.BAD_REQUEST)
                    .bodyJson()
                    .isLenientlyEqualTo("""
                            {
                              "errors": [
                                { "field": "email", "code": "required" },
                                { "field": "name", "code": "required" }
                              ]
                            }
                            """);
        }

        @Test
        void anUnknownEnumValuePointsAtItsFieldWithoutEchoingTheValue() {
            MvcTestResult result = mvc.post()
                    .uri("/probe/body")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""
                            { "name": "Aline", "email": "aline@kora.demo", "role": "SUPERUSER" }
                            """)
                    .exchange();

            assertThat(result).hasStatus(HttpStatus.BAD_REQUEST).bodyJson().isLenientlyEqualTo("""
                            { "code": "validation.failed", "errors": [{ "field": "role", "code": "invalid" }] }
                            """);
            assertThat(result).bodyText().doesNotContain("SUPERUSER");
        }

        @Test
        void malformedJsonIsReportedOnTheBody() {
            assertThat(mvc.post()
                            .uri("/probe/body")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{ \"name\": "))
                    .hasStatus(HttpStatus.BAD_REQUEST)
                    .bodyJson()
                    .isLenientlyEqualTo("""
                            { "errors": [{ "field": "body", "code": "invalid" }] }
                            """);
        }

        @Test
        void aMissingBodyIsReportedAsRequired() {
            assertThat(mvc.post().uri("/probe/body").contentType(MediaType.APPLICATION_JSON))
                    .hasStatus(HttpStatus.BAD_REQUEST)
                    .bodyJson()
                    .isLenientlyEqualTo("""
                            { "errors": [{ "field": "body", "code": "required" }] }
                            """);
        }

        @Test
        void aMalformedPathIdIsInvalidInputNotAServerError() {
            assertThat(mvc.get().uri("/probe/items/not-a-uuid"))
                    .hasStatus(HttpStatus.BAD_REQUEST)
                    .bodyJson()
                    .isLenientlyEqualTo("""
                            { "errors": [{ "field": "id", "code": "invalid" }] }
                            """);
        }

        @Test
        void constraintsOnRequestParametersUseTheParameterName() {
            assertThat(mvc.get().uri("/probe/search?q=far-too-long"))
                    .hasStatus(HttpStatus.BAD_REQUEST)
                    .bodyJson()
                    .isLenientlyEqualTo("""
                            { "errors": [{ "field": "q", "code": "length", "params": { "max": 5 } }] }
                            """);
        }

        @Test
        void aMissingRequestParameterIsRequired() {
            assertThat(mvc.get().uri("/probe/search"))
                    .hasStatus(HttpStatus.BAD_REQUEST)
                    .bodyJson()
                    .isLenientlyEqualTo("""
                            { "errors": [{ "field": "q", "code": "required" }] }
                            """);
        }
    }

    @Nested
    class CorrelationIds {

        @Test
        void aSafeClientIdIsEchoed() {
            assertThat(mvc.get().uri("/probe/missing").header(CorrelationId.HEADER, "web-1234-abcd"))
                    .hasHeader(CorrelationId.HEADER, "web-1234-abcd")
                    .bodyJson()
                    .extractingPath("$.correlationId")
                    .isEqualTo("web-1234-abcd");
        }

        @Test
        void anUnsafeClientIdIsReplacedWithAUuid() {
            MvcTestResult result = mvc.get()
                    .uri("/probe/missing")
                    .header(CorrelationId.HEADER, "evil\r\nSet-Cookie: x=1")
                    .exchange();

            String issued = result.getResponse().getHeader(CorrelationId.HEADER);
            assertThat(UUID.fromString(issued)).isNotNull();
        }

        @Test
        void successfulResponsesCarryAnIdToo() {
            assertThat(mvc.put().uri("/probe/versioned").header("If-Match", "\"4\""))
                    .hasStatusOk()
                    .headers()
                    .containsHeader(CorrelationId.HEADER);
        }
    }

    @Nested
    class OptimisticLocking {

        @Test
        void aCurrentVersionIsAccepted() {
            assertThat(mvc.put().uri("/probe/versioned").header("If-Match", "\"4\""))
                    .hasStatusOk()
                    .bodyText()
                    .isEqualTo("saved version 4");
        }

        @Test
        void aWeakEtagFromAProxyIsTolerated() {
            assertThat(mvc.put().uri("/probe/versioned").header("If-Match", "W/\"4\""))
                    .hasStatusOk();
        }

        @Test
        void aStaleVersionIs412() {
            assertThat(mvc.put().uri("/probe/versioned").header("If-Match", "\"3\""))
                    .hasStatus(HttpStatus.PRECONDITION_FAILED)
                    .bodyJson()
                    .extractingPath("$.code")
                    .isEqualTo("concurrency.stale_version");
        }

        @Test
        void aMissingIfMatchIs428() {
            assertThat(mvc.put().uri("/probe/versioned"))
                    .hasStatus(HttpStatus.PRECONDITION_REQUIRED)
                    .bodyJson()
                    .extractingPath("$.code")
                    .isEqualTo("concurrency.if_match_required");
        }

        @Test
        void aMalformedIfMatchIs428() {
            assertThat(mvc.put().uri("/probe/versioned").header("If-Match", "*"))
                    .hasStatus(HttpStatus.PRECONDITION_REQUIRED);
        }

        @Test
        void aConcurrentWriteCaughtByJpaIs412() {
            assertThat(mvc.get().uri("/probe/lost-update"))
                    .hasStatus(HttpStatus.PRECONDITION_FAILED)
                    .bodyJson()
                    .extractingPath("$.code")
                    .isEqualTo("concurrency.stale_version");
        }
    }

    @Nested
    class Paging {

        @Test
        void pagesUseTheContractShapeAndTheDefaultSort() {
            assertThat(mvc.get().uri("/probe/page?page=1&size=2"))
                    .hasStatusOk()
                    .hasHeader("X-Applied-Sort", "user.fullName: ASC")
                    .bodyJson()
                    .isStrictlyEqualTo("""
                            { "content": ["a", "b"], "page": 1, "size": 2, "totalElements": 5, "totalPages": 3 }
                            """);
        }

        @Test
        void allowedSortFieldsAreTranslatedToEntityProperties() {
            assertThat(mvc.get().uri("/probe/page?sort=fullName,desc&sort=joinedAt"))
                    .hasStatusOk()
                    .hasHeader("X-Applied-Sort", "user.fullName: DESC,joinedAt: ASC");
        }

        @Test
        void unknownSortFieldsAreRejectedWithTheAllowedList() {
            assertThat(mvc.get().uri("/probe/page?sort=passwordHash,asc"))
                    .hasStatus(HttpStatus.BAD_REQUEST)
                    .bodyJson()
                    .isLenientlyEqualTo("""
                            {
                              "code": "validation.failed",
                              "errors": [{
                                "field": "sort",
                                "code": "invalid",
                                "params": { "allowed": ["fullName", "joinedAt"] }
                              }]
                            }
                            """);
        }

        @Test
        void pageSizeIsCappedAt100() {
            assertThat(mvc.get().uri("/probe/page?size=500"))
                    .hasStatusOk()
                    .bodyJson()
                    .extractingPath("$.size")
                    .isEqualTo(100);
        }
    }

    /** Test-only endpoints that trigger each convention. */
    @RestController
    @RequestMapping("/probe")
    static class ProbeController {

        private static final SortPolicy SORT = SortPolicy.defaultingTo(Sort.by("user.fullName"))
                .allow("fullName", "user.fullName")
                .allow("joinedAt");

        enum Role {
            ADMIN,
            VIEWER
        }

        record Body(
                @NotBlank @Size(min = 2, max = 10) String name,
                @NotNull @Email String email,
                Role role) {}

        @GetMapping("/missing")
        String missing() {
            throw NotFoundException.of("Widget", 42);
        }

        @GetMapping("/conflict")
        String conflict() {
            throw new ConflictException(
                    "invitations.already_member",
                    "Already a member",
                    List.of(FieldViolation.of("email", "invitations.already_member", "is already a member")));
        }

        @GetMapping("/boom")
        String boom() {
            throw new IllegalStateException("secret internal detail");
        }

        @GetMapping("/lost-update")
        String lostUpdate() {
            throw new ObjectOptimisticLockingFailureException(Object.class, "id");
        }

        @PostMapping("/body")
        Body body(@Valid @RequestBody Body body) {
            return body;
        }

        @GetMapping("/items/{id}")
        String item(@PathVariable UUID id) {
            return id.toString();
        }

        @GetMapping("/search")
        String search(@RequestParam("q") @Size(max = 5) String query) {
            return query;
        }

        @PutMapping("/versioned")
        String versioned(@IfMatchVersion long expectedVersion) {
            OptimisticLock.check(expectedVersion, 4);
            return "saved version 4";
        }

        @GetMapping("/page")
        ResponseEntity<PageResponse<String>> page(Pageable requested) {
            Pageable pageable = SORT.apply(requested);
            PageResponse<String> body = PageResponse.from(new PageImpl<>(List.of("a", "b"), pageable, 5));
            return ResponseEntity.ok()
                    .header("X-Applied-Sort", pageable.getSort().toString())
                    .body(body);
        }
    }
}
