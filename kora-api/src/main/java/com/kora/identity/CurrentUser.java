package com.kora.identity;

import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.error.UnauthenticatedException;
import java.util.Optional;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/** The user behind the current request, taken from the verified access token's {@code sub} claim. */
public final class CurrentUser {

    private CurrentUser() {}

    public static Optional<UUID> find() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication instanceof JwtAuthenticationToken token && token.isAuthenticated()) {
            return Optional.of(UUID.fromString(token.getName()));
        }
        return Optional.empty();
    }

    public static UUID id() {
        return find().orElseThrow(
                        () -> new UnauthenticatedException(PlatformErrorCodes.UNAUTHENTICATED, "Sign in to continue"));
    }
}
