package com.kora.platform.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * One structured log line per API request: method, path, status and duration, plus the correlation id from the
 * logging context. The query string is left out on purpose: search terms can be personal data (names, emails).
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
class AccessLogFilter extends OncePerRequestFilter {

    private static final Logger ACCESS_LOG = LoggerFactory.getLogger("kora.access");

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // Health probes hit every few seconds; logging them would drown real traffic.
        return request.getRequestURI().startsWith("/actuator");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        long start = System.nanoTime();
        try {
            chain.doFilter(request, response);
        } finally {
            long durationMs = (System.nanoTime() - start) / 1_000_000;
            ACCESS_LOG
                    .atInfo()
                    .addKeyValue("http.method", request.getMethod())
                    .addKeyValue("url.path", request.getRequestURI())
                    .addKeyValue("http.status", response.getStatus())
                    .addKeyValue("duration.ms", durationMs)
                    .log(
                            "{} {} -> {} in {} ms",
                            request.getMethod(),
                            request.getRequestURI(),
                            response.getStatus(),
                            durationMs);
        }
    }
}
