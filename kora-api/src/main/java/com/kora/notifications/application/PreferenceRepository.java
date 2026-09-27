package com.kora.notifications.application;

import com.kora.notifications.domain.NotificationPreference;
import com.kora.notifications.domain.NotificationType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Persistence port for notification preferences (per person, not per organization). */
public interface PreferenceRepository {

    List<NotificationPreference> findByUserId(UUID userId);

    Optional<NotificationPreference> findByUserIdAndType(UUID userId, NotificationType type);

    NotificationPreference save(NotificationPreference preference);
}
