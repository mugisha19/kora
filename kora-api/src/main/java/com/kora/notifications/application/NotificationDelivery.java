package com.kora.notifications.application;

import com.kora.identity.AccountView;
import com.kora.identity.UserAccounts;
import com.kora.notifications.application.NotificationService.Channels;
import com.kora.notifications.domain.Notification;
import com.kora.notifications.domain.NotificationType;
import com.kora.platform.mail.EmailMessage;
import com.kora.platform.mail.EmailSender;
import java.time.Clock;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.MessageSource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Delivers one notification to one person on the channels they chose: stored for the app (and pushed live), and/or
 * emailed. Runs inside the dispatcher's organization transaction; the push and the email wait for its commit.
 */
@Component
class NotificationDelivery {

    private static final Logger LOG = LoggerFactory.getLogger(NotificationDelivery.class);

    private final NotificationRepository notifications;
    private final NotificationService service;
    private final UserAccounts accounts;
    private final EmailSender emails;
    private final MessageSource messages;
    private final LivePush push;
    private final Clock clock;
    private final String webBaseUrl;

    NotificationDelivery(
            NotificationRepository notifications,
            NotificationService service,
            UserAccounts accounts,
            EmailSender emails,
            MessageSource messages,
            LivePush push,
            Clock clock,
            @Value("${kora.web.base-url}") String webBaseUrl) {
        this.notifications = notifications;
        this.service = service;
        this.accounts = accounts;
        this.emails = emails;
        this.messages = messages;
        this.push = push;
        this.clock = clock;
        this.webBaseUrl = webBaseUrl;
    }

    void deliver(
            UUID organizationId,
            UUID userId,
            NotificationType type,
            Map<String, Object> params,
            String link,
            String eventKey) {
        // At-least-once delivery: the same event may come again after a crash; the key makes that a no-op.
        if (notifications.existsByUserIdAndEventKey(userId, eventKey)) {
            return;
        }
        Channels channels = service.channelsFor(userId, type);
        if (channels.inApp()) {
            Notification saved = notifications.save(
                    Notification.of(organizationId, userId, type, params, link, eventKey, clock.instant()));
            afterCommit(() -> push.toUser(organizationId, userId, saved));
        } else {
            // Remembered anyway (as read) so a redelivery doesn't email twice.
            Notification quiet = Notification.of(organizationId, userId, type, params, link, eventKey, clock.instant());
            quiet.markRead(clock.instant());
            notifications.save(quiet);
        }
        if (channels.email()) {
            AccountView account = accounts.get(userId);
            afterCommit(() -> email(account, type, params, link));
        }
    }

    private void email(AccountView account, NotificationType type, Map<String, Object> params, String link) {
        Object[] arguments = {
            params.getOrDefault("key", ""),
            params.getOrDefault("title", ""),
            webBaseUrl + link,
            params.getOrDefault("week", ""),
            Boolean.TRUE.equals(params.get("approved")) ? 1 : 0
        };
        try {
            String subject = messages.getMessage(
                    type.titleKey() + ".subject", arguments, account.locale().toLocale());
            String body = messages.getMessage(
                    type.titleKey() + ".body", arguments, account.locale().toLocale());
            emails.send(new EmailMessage(account.email(), subject, body));
        } catch (RuntimeException failure) {
            // The notification is in the app already; a mail outage must not fail (and so retry) the delivery.
            LOG.error("Could not email a {} notification", type, failure);
        }
    }

    private static void afterCommit(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            action.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                action.run();
            }
        });
    }
}
