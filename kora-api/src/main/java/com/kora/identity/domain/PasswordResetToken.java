package com.kora.identity.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * A single-use, expiring password reset link. Identified by the SHA-256 of the emailed token, so the table alone
 * can't be used to reset anyone's password.
 */
@Entity
@Table(name = "password_reset_tokens")
public class PasswordResetToken {

    public static final Duration LIFETIME = Duration.ofMinutes(30);

    @Id
    @Column(name = "token_hash")
    private String tokenHash;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "used_at")
    private Instant usedAt;

    protected PasswordResetToken() {
        // for JPA
    }

    public PasswordResetToken(String tokenHash, UUID userId, Instant now) {
        this.tokenHash = Objects.requireNonNull(tokenHash);
        this.userId = Objects.requireNonNull(userId);
        this.expiresAt = now.plus(LIFETIME);
    }

    public boolean isUsable(Instant now) {
        return usedAt == null && now.isBefore(expiresAt);
    }

    public void markUsed(Instant now) {
        if (!isUsable(now)) {
            throw new IllegalStateException("A reset token can only be used once, before it expires");
        }
        this.usedAt = now;
    }

    public UUID getUserId() {
        return userId;
    }
}
