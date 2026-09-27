package com.kora.platform.audit;

import com.kora.platform.web.CorrelationId;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Who is acting and from where, read from the current request. Jobs and listeners have no request: their entries
 * carry no actor.
 */
final class AuditContext {

    private static final int USER_AGENT_MAX = 300;

    private AuditContext() {}

    record Origin(UUID actorId, String actorIp, String userAgent, String correlationId) {}

    static Origin current() {
        HttpServletRequest request = request();
        return new Origin(
                actor(),
                request == null ? null : maskIp(request.getRemoteAddr()),
                request == null ? null : truncate(request.getHeader("User-Agent")),
                CorrelationId.current().orElse(null));
    }

    static HttpServletRequest request() {
        return RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes
                ? attributes.getRequest()
                : null;
    }

    /** The signed-in user: the access token's subject. */
    static UUID actor() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
                || !authentication.isAuthenticated()
                || authentication instanceof AnonymousAuthenticationToken) {
            return null;
        }
        try {
            return UUID.fromString(authentication.getName());
        } catch (IllegalArgumentException notAUser) {
            return null;
        }
    }

    /**
     * Personal data is kept to what an investigation needs: the network, not the device. IPv4 loses its last octet,
     * IPv6 everything after the first three groups.
     */
    static String maskIp(String ip) {
        if (ip == null || ip.isBlank()) {
            return null;
        }
        if (ip.contains(":")) {
            String[] groups = ip.split(":");
            StringBuilder masked = new StringBuilder();
            for (int i = 0; i < Math.min(3, groups.length); i++) {
                masked.append(groups[i]).append(':');
            }
            return masked.append(':').toString();
        }
        int lastDot = ip.lastIndexOf('.');
        return lastDot < 0 ? null : ip.substring(0, lastDot) + ".0";
    }

    private static String truncate(String text) {
        if (text == null) {
            return null;
        }
        return text.length() <= USER_AGENT_MAX ? text : text.substring(0, USER_AGENT_MAX);
    }
}
