package com.kora.identity.adapter.web;

import com.kora.identity.adapter.web.AuthRequests.ForgotPasswordRequest;
import com.kora.identity.adapter.web.AuthRequests.LoginRequest;
import com.kora.identity.adapter.web.AuthRequests.ResetPasswordRequest;
import com.kora.identity.application.LoginService;
import com.kora.identity.application.PasswordResetService;
import com.kora.identity.application.SessionService;
import com.kora.identity.web.SessionResponse;
import com.kora.identity.web.SessionResponses;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code Auth}: sign in, refresh, sign out, recover a password (feature 01). */
@RestController
@RequestMapping("/api/v1/auth")
class AuthController {

    private final LoginService login;
    private final SessionService sessions;
    private final PasswordResetService passwordReset;
    private final SessionResponses responses;

    AuthController(
            LoginService login,
            SessionService sessions,
            PasswordResetService passwordReset,
            SessionResponses responses) {
        this.login = login;
        this.sessions = sessions;
        this.passwordReset = passwordReset;
        this.responses = responses;
    }

    @PostMapping("/login")
    ResponseEntity<SessionResponse> login(@Valid @RequestBody LoginRequest body, HttpServletRequest request) {
        return responses.respond(HttpStatus.OK, login.login(body.email(), body.password(), request.getRemoteAddr()));
    }

    @PostMapping("/refresh")
    ResponseEntity<SessionResponse> refresh(
            @CookieValue(name = SessionResponses.REFRESH_COOKIE, required = false) String refreshToken) {
        return responses.respond(HttpStatus.OK, sessions.refresh(refreshToken));
    }

    /** Always succeeds: signing out an already-ended session is not an error. */
    @PostMapping("/logout")
    ResponseEntity<Void> logout(
            @CookieValue(name = SessionResponses.REFRESH_COOKIE, required = false) String refreshToken) {
        sessions.logout(refreshToken);
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, responses.clearedRefreshCookie().toString())
                .build();
    }

    @PostMapping("/password/forgot")
    ResponseEntity<Void> forgotPassword(@Valid @RequestBody ForgotPasswordRequest body, HttpServletRequest request) {
        passwordReset.requestReset(body.email(), request.getRemoteAddr());
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/password/reset")
    ResponseEntity<Void> resetPassword(@Valid @RequestBody ResetPasswordRequest body, HttpServletRequest request) {
        passwordReset.reset(body.token(), body.newPassword(), request.getRemoteAddr());
        return ResponseEntity.noContent().build();
    }
}
