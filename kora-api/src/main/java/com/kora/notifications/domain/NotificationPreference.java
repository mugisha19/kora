package com.kora.notifications.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

/** How one person wants one kind of notification; theirs across organizations, like their account. */
@Entity
@Table(name = "notification_preferences")
@IdClass(NotificationPreference.Key.class)
public class NotificationPreference {

    public record Key(UUID userId, NotificationType type) implements Serializable {}

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Id
    @Enumerated(EnumType.STRING)
    private NotificationType type;

    @Column(name = "in_app", nullable = false)
    private boolean inApp;

    @Column(nullable = false)
    private boolean email;

    protected NotificationPreference() {
        // for JPA
    }

    public static NotificationPreference of(UUID userId, NotificationType type, boolean inApp, boolean email) {
        NotificationPreference preference = new NotificationPreference();
        preference.userId = Objects.requireNonNull(userId);
        preference.type = Objects.requireNonNull(type);
        preference.choose(inApp, email);
        return preference;
    }

    /** What applies before someone chooses: in the app always, by email for what they must act on. */
    public static NotificationPreference standard(UUID userId, NotificationType type) {
        return of(userId, type, true, type.emailByDefault());
    }

    public void choose(boolean newInApp, boolean newEmail) {
        this.inApp = newInApp;
        this.email = newEmail;
    }

    public NotificationType getType() {
        return type;
    }

    public boolean isInApp() {
        return inApp;
    }

    public boolean isEmail() {
        return email;
    }
}
