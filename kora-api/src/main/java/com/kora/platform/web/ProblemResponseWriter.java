package com.kora.platform.web;

import com.kora.platform.audit.AuditTrail;
import com.kora.platform.error.ProblemException;
import com.kora.platform.error.RateLimitedException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * Writes Problem Details from code that runs before Spring MVC (servlet filters, Spring Security's entry point and
 * access-denied handler), where {@code @ExceptionHandler}s can't help. Same shape as {@link ProblemDetailsHandler}.
 */
@Component
public class ProblemResponseWriter {

    private final JsonMapper json;
    private final AuditTrail audit;

    ProblemResponseWriter(JsonMapper json, AuditTrail audit) {
        this.json = json;
        this.audit = audit;
    }

    public void write(HttpServletRequest request, HttpServletResponse response, ProblemException problem)
            throws IOException {
        HttpStatus status = ProblemDetailsFactory.statusOf(problem);
        if (status == HttpStatus.FORBIDDEN) {
            audit.denied(request);
        }
        if (problem instanceof RateLimitedException rateLimited) {
            response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(rateLimited.retryAfterSeconds()));
        }
        write(request, response, status, ProblemDetailsFactory.from(problem));
    }

    private void write(HttpServletRequest request, HttpServletResponse response, HttpStatus status, ProblemDetail body)
            throws IOException {
        ProblemDetail problem = ProblemDetailsFactory.complete(body, status, request.getRequestURI());
        response.setStatus(status.value());
        // No charset parameter: JSON is UTF-8 by definition (RFC 8259), and the bytes below are written as UTF-8.
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        json.writeValue(response.getOutputStream(), ProblemDetailsFactory.toMap(problem));
    }
}
