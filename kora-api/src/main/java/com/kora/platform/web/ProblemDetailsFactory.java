package com.kora.platform.web;

import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.error.ProblemException;
import java.net.URI;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;

/**
 * Builds the contract's Problem Details (ADR 0005) for both paths an error can take: Spring MVC's exception
 * handling ({@link ProblemDetailsHandler}) and servlet filters or Spring Security, which run before MVC
 * ({@link ProblemResponseWriter}). One factory keeps the two byte-for-byte consistent.
 */
final class ProblemDetailsFactory {

    static final String CODE = "code";
    static final String CORRELATION_ID = "correlationId";
    static final String ERRORS = "errors";
    static final String GENERIC_SERVER_ERROR = "An unexpected error occurred";

    private static final String TYPE_PREFIX = "urn:kora:problem:";

    private ProblemDetailsFactory() {}

    static ProblemDetail create(HttpStatusCode status, String detail, String code, List<FieldViolation> violations) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setProperty(CODE, code);
        if (!violations.isEmpty()) {
            problem.setProperty(
                    ERRORS,
                    violations.stream().map(ProblemDetailsFactory::toJson).toList());
        }
        return problem;
    }

    static ProblemDetail from(ProblemException ex) {
        return create(statusOf(ex), ex.getMessage(), ex.code(), ex.violations());
    }

    static HttpStatus statusOf(ProblemException ex) {
        return HttpStatus.valueOf(ex.kind().status());
    }

    /** Fills in what every problem needs: code (from the status if none), type, correlation id and instance. */
    static ProblemDetail complete(ProblemDetail problem, HttpStatusCode status, String requestUri) {
        Map<String, Object> properties = problem.getProperties();
        String code =
                properties != null && properties.get(CODE) instanceof String existing ? existing : defaultCode(status);
        problem.setProperty(CODE, code);
        problem.setType(URI.create(TYPE_PREFIX + code));
        problem.setProperty(
                CORRELATION_ID,
                CorrelationId.current().orElseGet(() -> UUID.randomUUID().toString()));
        if (problem.getInstance() == null && requestUri != null) {
            problem.setInstance(URI.create(requestUri));
        }
        if (status.is5xxServerError()) {
            // Internal messages never reach the client; the log has the details under the correlation id.
            problem.setDetail(GENERIC_SERVER_ERROR);
        }
        return problem;
    }

    /** JSON view of a problem for writers that bypass Spring MVC's message converters. */
    static Map<String, Object> toMap(ProblemDetail problem) {
        Map<String, Object> json = new LinkedHashMap<>();
        json.put("type", problem.getType().toString());
        json.put("title", problem.getTitle());
        json.put("status", problem.getStatus());
        if (problem.getDetail() != null) {
            json.put("detail", problem.getDetail());
        }
        if (problem.getInstance() != null) {
            json.put("instance", problem.getInstance().toString());
        }
        if (problem.getProperties() != null) {
            json.putAll(problem.getProperties());
        }
        return json;
    }

    private static String defaultCode(HttpStatusCode status) {
        return switch (status.value()) {
            case 401 -> PlatformErrorCodes.UNAUTHENTICATED;
            case 403 -> PlatformErrorCodes.ACCESS_DENIED;
            case 404 -> PlatformErrorCodes.RESOURCE_NOT_FOUND;
            case 405 -> PlatformErrorCodes.METHOD_NOT_ALLOWED;
            case 406, 415 -> PlatformErrorCodes.MEDIA_TYPE_UNSUPPORTED;
            case 412 -> PlatformErrorCodes.STALE_VERSION;
            case 428 -> PlatformErrorCodes.IF_MATCH_REQUIRED;
            case 429 -> PlatformErrorCodes.RATE_LIMITED;
            default ->
                status.is4xxClientError() ? PlatformErrorCodes.VALIDATION_FAILED : PlatformErrorCodes.INTERNAL_ERROR;
        };
    }

    /** Explicit map so that an empty {@code params} is omitted rather than rendered as {@code {}}. */
    private static Map<String, Object> toJson(FieldViolation violation) {
        Map<String, Object> json = new LinkedHashMap<>();
        json.put("field", violation.field());
        json.put(CODE, violation.code());
        json.put("message", violation.message());
        if (!violation.params().isEmpty()) {
            json.put("params", violation.params());
        }
        return json;
    }
}
