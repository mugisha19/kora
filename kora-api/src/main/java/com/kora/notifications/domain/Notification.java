package com.kora.notifications.domain;

import com.kora.platform.audit.NotAudited;
import com.kora.platform.persistence.JsonColumnConverter;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Converter;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.hibernate.annotations.TenantId;
import tools.jackson.core.type.TypeReference;

/**
 * One notification for one person (feature 18). Its title is a translation key with parameters, so each client shows
 * it in its user's language. The event key makes a redelivered event (at-least-once) harmless.
 *
 * <p>Not audited: it is a consequence of audited changes, not a change of its own.
 */
@NotAudited
@Entity
@Table(name = "notifications")
public class Notification {

    @Id
    private UUID id;

    @TenantId
    @Column(name = "organization_id", nullable = false, updatable = false)
    private UUID organizationId;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, updatable = false)
    private NotificationType type;

    @Column(name = "title_key", nullable = false, updatable = false)
    private String titleKey;

    @Convert(converter = ParamsConverter.class)
    @Column(nullable = false, updatable = false)
    private Map<String, Object> params;

    @Column(updatable = false)
    private String link;

    @Column(name = "event_key", nullable = false, updatable = false)
    private String eventKey;

    @Column(name = "read_at")
    private Instant readAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected Notification() {
        // for JPA
    }

    public static Notification of(
            UUID organizationId,
            UUID userId,
            NotificationType type,
            Map<String, Object> params,
            String link,
            String eventKey,
            Instant now) {
        Notification notification = new Notification();
        notification.id = UUID.randomUUID();
        notification.organizationId = Objects.requireNonNull(organizationId);
        notification.userId = Objects.requireNonNull(userId);
        notification.type = Objects.requireNonNull(type);
        notification.titleKey = type.titleKey();
        notification.params = Map.copyOf(params);
        notification.link = link;
        notification.eventKey = Objects.requireNonNull(eventKey);
        notification.createdAt = Objects.requireNonNull(now);
        return notification;
    }

    public void markRead(Instant now) {
        if (readAt == null) {
            this.readAt = now;
        }
    }

    public UUID getId() {
        return id;
    }

    public UUID getOrganizationId() {
        return organizationId;
    }

    public UUID getUserId() {
        return userId;
    }

    public NotificationType getType() {
        return type;
    }

    public String getTitleKey() {
        return titleKey;
    }

    public Map<String, Object> getParams() {
        return params;
    }

    public String getLink() {
        return link;
    }

    public Instant getReadAt() {
        return readAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    @Converter
    public static class ParamsConverter extends JsonColumnConverter<Map<String, Object>> {
        public ParamsConverter() {
            super(new TypeReference<>() {});
        }
    }
}
