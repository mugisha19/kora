package com.kora.identity.adapter.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;

/**
 * Ignores the {@code Authorization} header on public endpoints. Otherwise an expired access token that the client
 * still attaches to {@code /auth/refresh} would be rejected with 401 before the refresh could run, and the user
 * could never renew their session.
 */
final class PublicPathsBearerTokenResolver implements BearerTokenResolver {

    private final BearerTokenResolver delegate = new DefaultBearerTokenResolver();

    @Override
    public String resolve(HttpServletRequest request) {
        String path = request.getRequestURI();
        for (String prefix : SecurityConfiguration.PUBLIC_PATH_PREFIXES) {
            if (path.startsWith(prefix)) {
                return null;
            }
        }
        return delegate.resolve(request);
    }
}
