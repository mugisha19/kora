package com.kora.identity.domain;

import com.kora.identity.UserLocale;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** A person who can sign in. Global rather than tenant-owned: memberships link a user to organizations. */
@Entity
@Table(name = "users")
public class User {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "full_name", nullable = false)
    private String fullName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserLocale locale;

    @Column(nullable = false)
    private boolean enabled;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Version
    private Long version;

    protected User() {
        // for JPA
    }

    private User(UUID id, String email, String passwordHash, String fullName, UserLocale locale, Instant createdAt) {
        this.id = Objects.requireNonNull(id);
        this.email = EmailAddresses.normalize(email);
        this.passwordHash = Objects.requireNonNull(passwordHash);
        this.fullName = requireName(fullName);
        this.locale = Objects.requireNonNull(locale);
        this.enabled = true;
        this.createdAt = Objects.requireNonNull(createdAt);
    }

    /** @param passwordHash already hashed; the domain never sees raw passwords once they are checked */
    public static User register(String email, String passwordHash, String fullName, UserLocale locale, Instant now) {
        return new User(UUID.randomUUID(), email, passwordHash, fullName, locale, now);
    }

    public void changePassword(String newPasswordHash) {
        this.passwordHash = Objects.requireNonNull(newPasswordHash);
    }

    public void rename(String newFullName) {
        this.fullName = requireName(newFullName);
    }

    public void changeLocale(UserLocale newLocale) {
        this.locale = Objects.requireNonNull(newLocale);
    }

    private static String requireName(String name) {
        String trimmed = Objects.requireNonNull(name).strip();
        if (trimmed.isEmpty()) {
            throw new IllegalArgumentException("A user needs a name");
        }
        return trimmed;
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getFullName() {
        return fullName;
    }

    public UserLocale getLocale() {
        return locale;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
