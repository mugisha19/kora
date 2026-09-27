package com.kora.organization.adapter.web;

import com.kora.identity.CurrentUser;
import com.kora.organization.ActiveMember;
import com.kora.organization.CurrentMember;
import com.kora.organization.application.ActiveMemberLookup;
import com.kora.platform.error.ForbiddenException;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.error.ProblemException;
import com.kora.platform.error.ProblemKind;
import com.kora.platform.tenancy.TenantScope;
import com.kora.platform.web.ProblemResponseWriter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Tenant isolation, request layer: resolves {@code X-Organization-Id} once per request (ADR 0007).
 *
 * <p>Runs after Spring Security (order {@code 0}, the security chain is at {@code -100}), so the caller is already
 * authenticated. The header must name an organization the caller belongs to, otherwise the request stops here with
 * {@code 403 tenant.forbidden}, whether or not that organization exists. For a member, the rest of the request runs
 * inside that organization's {@link TenantScope} and as that {@link CurrentMember}.
 *
 * <p>Requests without the header continue unscoped; tenant-scoped use cases then answer
 * {@code 400 tenant.header_invalid}.
 */
@Component
@Order(0)
class TenantFilter extends OncePerRequestFilter {

    static final String HEADER = "X-Organization-Id";
    static final String ORGANIZATION_KEY = "organizationId";
    static final String USER_KEY = "userId";

    private final ActiveMemberLookup members;
    private final ProblemResponseWriter problems;

    TenantFilter(ActiveMemberLookup members, ProblemResponseWriter problems) {
        this.members = members;
        this.problems = problems;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader(HEADER);
        Optional<UUID> userId = header == null ? Optional.empty() : CurrentUser.find();
        if (userId.isEmpty()) {
            chain.doFilter(request, response);
            return;
        }
        Optional<UUID> organizationId = parse(header);
        if (organizationId.isEmpty()) {
            problems.write(
                    request,
                    response,
                    new ProblemException(
                            ProblemKind.INVALID_INPUT,
                            PlatformErrorCodes.TENANT_HEADER_INVALID,
                            HEADER + " must be an organization id (UUID)"));
            return;
        }
        Optional<ActiveMember> member = members.find(organizationId.get(), userId.get());
        if (member.isEmpty()) {
            problems.write(
                    request,
                    response,
                    new ForbiddenException(
                            PlatformErrorCodes.TENANT_FORBIDDEN, "You are not a member of this organization"));
            return;
        }
        continueAs(member.get(), request, response, chain);
    }

    private static void continueAs(
            ActiveMember member, HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        // Every log line of the request says whose it was: ids only, never names or emails (feature 24).
        MDC.put(ORGANIZATION_KEY, member.organizationId().toString());
        MDC.put(USER_KEY, member.userId().toString());
        try {
            TenantScope.<Void, Exception>callAs(
                    member.organizationId(),
                    () -> CurrentMember.<Void, Exception>callAs(member, () -> {
                        chain.doFilter(request, response);
                        return null;
                    }));
        } catch (IOException | ServletException | RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new ServletException(e);
        } finally {
            MDC.remove(ORGANIZATION_KEY);
            MDC.remove(USER_KEY);
        }
    }

    private static Optional<UUID> parse(String header) {
        try {
            return Optional.of(UUID.fromString(header.strip()));
        } catch (IllegalArgumentException malformed) {
            return Optional.empty();
        }
    }
}
