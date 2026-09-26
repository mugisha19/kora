package com.kora.identity.application;

import com.kora.identity.IdentityErrorCodes;
import com.kora.identity.domain.EmailAddresses;
import com.kora.identity.domain.PasswordPolicy;
import com.kora.identity.domain.PasswordResetToken;
import com.kora.identity.domain.User;
import com.kora.platform.crypto.OpaqueTokens;
import com.kora.platform.error.GoneException;
import com.kora.platform.ratelimit.RateLimiter;
import com.kora.platform.ratelimit.RateLimits;
import java.time.Clock;
import java.time.Instant;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Forgotten passwords (feature 01). Requesting a reset never reveals whether the email has an account: the answer
 * is always {@code 202}, and the email itself is sent asynchronously so response times don't differ either.
 */
@Service
public class PasswordResetService {

    private final UserRepository users;
    private final PasswordResetTokenRepository tokens;
    private final PasswordHasher hasher;
    private final PasswordPolicy passwordPolicy;
    private final RateLimiter rateLimiter;
    private final RateLimits limits;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    PasswordResetService(
            UserRepository users,
            PasswordResetTokenRepository tokens,
            PasswordHasher hasher,
            PasswordPolicy passwordPolicy,
            RateLimiter rateLimiter,
            RateLimits limits,
            ApplicationEventPublisher events,
            Clock clock) {
        this.users = users;
        this.tokens = tokens;
        this.hasher = hasher;
        this.passwordPolicy = passwordPolicy;
        this.rateLimiter = rateLimiter;
        this.limits = limits;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public void requestReset(String email, String clientAddress) {
        String normalized = EmailAddresses.normalize(email);
        rateLimiter.acquire(limits.named("password-forgot-ip", "10/1h"), clientAddress);
        rateLimiter.acquire(limits.named("password-forgot-email", "3/1h"), normalized);
        users.findByEmail(normalized).filter(User::isEnabled).ifPresent(user -> {
            String token = OpaqueTokens.generate();
            tokens.save(new PasswordResetToken(OpaqueTokens.hash(token), user.getId(), clock.instant()));
            events.publishEvent(
                    new PasswordResetRequested(user.getEmail(), user.getFullName(), user.getLocale(), token));
        });
    }

    /** Sets the new password; every existing session of the user is then revoked ({@link PasswordChanged}). */
    @Transactional
    public void reset(String token, String newPassword, String clientAddress) {
        rateLimiter.acquire(limits.named("password-reset-ip", "10/1h"), clientAddress);
        Instant now = clock.instant();
        PasswordResetToken resetToken = tokens.findById(OpaqueTokens.hash(token))
                .filter(candidate -> candidate.isUsable(now))
                .orElseThrow(PasswordResetService::invalidToken);
        User user = users.findById(resetToken.getUserId())
                .filter(User::isEnabled)
                .orElseThrow(PasswordResetService::invalidToken);
        passwordPolicy.check("newPassword", newPassword);
        user.changePassword(hasher.hash(newPassword));
        resetToken.markUsed(now);
        events.publishEvent(new PasswordChanged(user.getId()));
    }

    private static GoneException invalidToken() {
        return new GoneException(
                IdentityErrorCodes.RESET_TOKEN_INVALID, "This reset link has expired or was already used");
    }
}
