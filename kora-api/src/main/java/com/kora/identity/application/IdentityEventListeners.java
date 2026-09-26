package com.kora.identity.application;

import com.kora.platform.mail.EmailMessage;
import com.kora.platform.mail.EmailSender;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.MessageSource;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Side effects of identity changes, run only after the change has committed (Observer): a rolled-back reset
 * request never sends an email, and a failed email never rolls back the reset request.
 */
@Component
class IdentityEventListeners {

    private static final Logger LOG = LoggerFactory.getLogger(IdentityEventListeners.class);

    private final EmailSender emails;
    private final MessageSource messages;
    private final SessionService sessions;
    private final String webBaseUrl;

    IdentityEventListeners(
            EmailSender emails,
            MessageSource messages,
            SessionService sessions,
            @Value("${kora.web.base-url}") String webBaseUrl) {
        this.emails = emails;
        this.messages = messages;
        this.sessions = sessions;
        this.webBaseUrl = webBaseUrl;
    }

    /** Asynchronous so that "account exists" and "no such account" take the same time to answer. */
    @Async
    @TransactionalEventListener
    void sendResetLink(PasswordResetRequested event) {
        String link = webBaseUrl + "/reset-password?token=" + URLEncoder.encode(event.token(), StandardCharsets.UTF_8);
        String subject = messages.getMessage(
                "identity.password-reset.subject", null, event.locale().toLocale());
        String body = messages.getMessage(
                "identity.password-reset.body",
                new Object[] {event.fullName(), link, 30},
                event.locale().toLocale());
        try {
            emails.send(new EmailMessage(event.email(), subject, body));
        } catch (RuntimeException failure) {
            // Logged, not rethrown: the user can simply ask again. The address itself is personal data.
            LOG.error("Could not send a password reset email", failure);
        }
    }

    @TransactionalEventListener
    void endSessionsAfterPasswordChange(PasswordChanged event) {
        sessions.revokeAll(event.userId());
    }
}
