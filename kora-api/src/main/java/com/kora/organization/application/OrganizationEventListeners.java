package com.kora.organization.application;

import com.kora.identity.UserProfileChanged;
import com.kora.platform.mail.EmailMessage;
import com.kora.platform.mail.EmailSender;
import com.kora.platform.tenancy.TenantScope;
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
 * Reactions that run after the triggering transaction commits, on a separate thread (Observer). Being asynchronous
 * they start with no tenant scope bound, and each binds exactly the scope it needs.
 */
@Component
class OrganizationEventListeners {

    private static final Logger LOG = LoggerFactory.getLogger(OrganizationEventListeners.class);

    private final EmailSender emails;
    private final MessageSource messages;
    private final MemberService members;
    private final String webBaseUrl;

    OrganizationEventListeners(
            EmailSender emails,
            MessageSource messages,
            MemberService members,
            @Value("${kora.web.base-url}") String webBaseUrl) {
        this.emails = emails;
        this.messages = messages;
        this.members = members;
        this.webBaseUrl = webBaseUrl;
    }

    @Async
    @TransactionalEventListener
    void sendInvitation(InvitationCreated event) {
        String link = webBaseUrl + "/invitations/" + URLEncoder.encode(event.token(), StandardCharsets.UTF_8);
        String role = messages.getMessage(
                "organization.role." + event.role().name(), null, event.locale().toLocale());
        String subject = messages.getMessage(
                "organization.invitation.subject",
                new Object[] {event.organizationName()},
                event.locale().toLocale());
        String body = messages.getMessage(
                "organization.invitation.body",
                new Object[] {event.inviterName(), event.organizationName(), role, link, 14},
                event.locale().toLocale());
        try {
            emails.send(new EmailMessage(event.email(), subject, body));
        } catch (RuntimeException failure) {
            // The admin can revoke and re-invite; failing here must not undo the invitation itself.
            LOG.error("Could not send an invitation email", failure);
        }
    }

    /** A user's new name must show in every organization they belong to, hence the system scope. */
    @Async
    @TransactionalEventListener
    void refreshMemberProfile(UserProfileChanged event) {
        TenantScope.runAsSystem(() -> members.syncProfile(event));
    }
}
