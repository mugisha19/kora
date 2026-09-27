package com.kora.notifications.application;

import com.kora.notifications.domain.Notification;
import java.util.UUID;

/** Port for live delivery to connected clients (the STOMP WebSocket adapter); best effort. */
public interface LivePush {

    void toUser(UUID organizationId, UUID userId, Notification notification);
}
