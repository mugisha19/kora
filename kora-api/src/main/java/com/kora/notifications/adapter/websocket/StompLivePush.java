package com.kora.notifications.adapter.websocket;

import com.kora.notifications.adapter.web.NotificationResponse;
import com.kora.notifications.application.LivePush;
import com.kora.notifications.domain.Notification;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

/** Pushes a new notification to the member's open connections in that organization; best effort. */
@Component
class StompLivePush implements LivePush {

    private static final Logger LOG = LoggerFactory.getLogger(StompLivePush.class);

    private final SimpMessagingTemplate broker;

    StompLivePush(SimpMessagingTemplate broker) {
        this.broker = broker;
    }

    @Override
    public void toUser(UUID organizationId, UUID userId, Notification notification) {
        try {
            broker.convertAndSendToUser(
                    StompAuthorization.nameOf(userId, organizationId),
                    "/queue/notifications",
                    NotificationResponse.of(notification));
        } catch (RuntimeException failure) {
            // The notification is stored; the client sees it on its next fetch.
            LOG.warn("Could not push a notification live", failure);
        }
    }
}
