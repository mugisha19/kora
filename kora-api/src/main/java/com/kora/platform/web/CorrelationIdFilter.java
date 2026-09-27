package com.kora.platform.web;

import io.micrometer.tracing.Span;
import io.micrometer.tracing.Tracer;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.MDC;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Fixes the request's correlation id, puts it in the logging context (so every log line of the request carries it)
 * and echoes it on the response, including error responses.
 *
 * <p>Runs right after the observation filter, which opens the request's trace: without an id from the client, the
 * correlation id is the trace id, so one id finds the request in the logs, the audit trail and the traces.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 2)
class CorrelationIdFilter extends OncePerRequestFilter {

    private final ObjectProvider<Tracer> tracer;

    CorrelationIdFilter(ObjectProvider<Tracer> tracer) {
        this.tracer = tracer;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String correlationId = CorrelationId.resolve(request.getHeader(CorrelationId.HEADER), traceId());
        MDC.put(CorrelationId.MDC_KEY, correlationId);
        response.setHeader(CorrelationId.HEADER, correlationId);
        try {
            chain.doFilter(request, response);
        } finally {
            // Threads are reused (virtual or pooled): never let one request's id leak into the next.
            MDC.remove(CorrelationId.MDC_KEY);
        }
    }

    private String traceId() {
        Tracer current = tracer.getIfAvailable();
        Span span = current == null ? null : current.currentSpan();
        return span == null ? null : span.context().traceId();
    }
}
