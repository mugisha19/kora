package com.kora.notifications.application;

import com.kora.notifications.domain.Notification;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Persistence port for notifications (tenant-filtered). */
public interface NotificationRepository {

    Optional<Notification> findById(UUID id);

    boolean existsByUserIdAndEventKey(UUID userId, String eventKey);

    /** The person's notifications before the cursor, newest first, at most {@code limit}. */
    List<Notification> page(UUID userId, boolean unreadOnly, Instant beforeCreatedAt, UUID beforeId, int limit);

    long countByUserIdAndReadAtIsNull(UUID userId);

    int markAllRead(UUID userId, Instant now);

    Notification save(Notification notification);
}
