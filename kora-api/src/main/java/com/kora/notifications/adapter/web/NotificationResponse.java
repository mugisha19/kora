package com.kora.notifications.adapter.web;

import com.kora.notifications.domain.Notification;
import com.kora.notifications.domain.NotificationType;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/** Contract schema {@code Notification}; also the payload pushed on {@code /user/queue/notifications}. */
public record NotificationResponse(
        UUID id,
        NotificationType type,
        String titleKey,
        Map<String, Object> params,
        String link,
        Instant readAt,
        Instant createdAt) {

    public static NotificationResponse of(Notification notification) {
        return new NotificationResponse(
                notification.getId(),
                notification.getType(),
                notification.getTitleKey(),
                notification.getParams(),
                notification.getLink(),
                notification.getReadAt(),
                notification.getCreatedAt());
    }
}
