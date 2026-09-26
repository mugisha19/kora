package com.kora.identity.web;

import com.kora.identity.IssuedSession;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

/**
 * Answers a sign-in with the access token in the body and the refresh token in a cookie the page's scripts can't
 * read: {@code HttpOnly} (no JavaScript access, so XSS can't steal it), {@code Secure} (HTTPS only; browsers treat
 * {@code http://localhost} as secure), {@code SameSite=Strict} (never sent by other sites, which also covers CSRF on
 * the refresh and logout endpoints) and {@code Path=/api/v1/auth} (not sent with any other API call).
 */
@Component
public class SessionResponses {

    public static final String REFRESH_COOKIE = "kora_refresh";
    static final String REFRESH_COOKIE_PATH = "/api/v1/auth";

    private final boolean secureCookie;

    SessionResponses(@Value("${kora.identity.refresh-token.cookie-secure}") boolean secureCookie) {
        this.secureCookie = secureCookie;
    }

    public ResponseEntity<SessionResponse> respond(HttpStatus status, IssuedSession session) {
        SessionResponse body = new SessionResponse(
                session.accessToken(), "Bearer", session.expiresInSeconds(), MeResponse.from(session.user()));
        return ResponseEntity.status(status)
                .header(
                        HttpHeaders.SET_COOKIE,
                        refreshCookie(session.refreshToken(), session.refreshTokenLifetime())
                                .toString())
                .body(body);
    }

    /** Expires the cookie in the browser (sign-out). */
    public ResponseCookie clearedRefreshCookie() {
        return refreshCookie("", Duration.ZERO);
    }

    private ResponseCookie refreshCookie(String value, Duration maxAge) {
        return ResponseCookie.from(REFRESH_COOKIE, value)
                .httpOnly(true)
                .secure(secureCookie)
                .sameSite("Strict")
                .path(REFRESH_COOKIE_PATH)
                .maxAge(maxAge)
                .build();
    }
}
