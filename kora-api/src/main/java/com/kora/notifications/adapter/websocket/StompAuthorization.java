package com.kora.notifications.adapter.websocket;

import com.kora.organization.ActiveMember;
import com.kora.organization.CurrentMember;
import com.kora.organization.Memberships;
import com.kora.platform.error.ProblemException;
import com.kora.platform.tenancy.TenantTransactions;
import com.kora.portfolio.ProjectAccess;
import java.security.Principal;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Component;

/**
 * Authentication and authorization for STOMP frames (feature 18). {@code CONNECT} must carry
 * {@code Authorization: Bearer <access token>} and {@code X-Organization-Id} naming an organization the user belongs
 * to; the connection then acts as that member. A {@code SUBSCRIBE} to a project topic needs the same visibility as
 * reading the project over REST; the only other destination is the member's own notification queue. Everything
 * else, including {@code SEND}, is refused.
 */
@Component
class StompAuthorization implements ChannelInterceptor {

    static final String NOTIFICATIONS = "/user/queue/notifications";
    private static final Pattern PROJECT_TOPIC = Pattern.compile("/topic/projects/([0-9a-fA-F-]{36})");

    private final JwtDecoder tokens;
    private final Memberships memberships;
    private final ProjectAccess projects;
    private final TenantTransactions transactions;

    StompAuthorization(
            JwtDecoder tokens, Memberships memberships, ProjectAccess projects, TenantTransactions transactions) {
        this.tokens = tokens;
        this.memberships = memberships;
        this.projects = projects;
        this.transactions = transactions;
    }

    /** The connected member; its name addresses {@code convertAndSendToUser}, one queue per user and organization. */
    record MemberPrincipal(ActiveMember member) implements Principal {

        @Override
        public String getName() {
            return nameOf(member.userId(), member.organizationId());
        }
    }

    static String nameOf(UUID userId, UUID organizationId) {
        return userId + ":" + organizationId;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor frame = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (frame == null || frame.getCommand() == null) {
            return message;
        }
        switch (frame.getCommand()) {
            case CONNECT, STOMP -> frame.setUser(connect(frame));
            case SUBSCRIBE -> authorizeSubscription(frame);
            case SEND -> throw refused("Clients can't send messages");
            default -> {
                // heartbeats, UNSUBSCRIBE, DISCONNECT, ACK need no check
            }
        }
        return message;
    }

    private MemberPrincipal connect(StompHeaderAccessor frame) {
        String authorization = frame.getFirstNativeHeader("Authorization");
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw refused("Sign in to continue");
        }
        UUID userId;
        try {
            userId = UUID.fromString(
                    tokens.decode(authorization.substring("Bearer ".length())).getSubject());
        } catch (JwtException | IllegalArgumentException invalid) {
            throw refused("Sign in to continue");
        }
        UUID organizationId = parse(frame.getFirstNativeHeader("X-Organization-Id"))
                .orElseThrow(() -> refused("X-Organization-Id must be an organization id (UUID)"));
        ActiveMember member = memberships
                .activeMember(organizationId, userId)
                .orElseThrow(() -> refused("You are not a member of this organization"));
        return new MemberPrincipal(member);
    }

    private void authorizeSubscription(StompHeaderAccessor frame) {
        if (!(frame.getUser() instanceof MemberPrincipal principal)) {
            throw refused("Sign in to continue");
        }
        String destination = frame.getDestination() == null ? "" : frame.getDestination();
        if (destination.equals(NOTIFICATIONS)) {
            return;
        }
        Matcher topic = PROJECT_TOPIC.matcher(destination);
        if (!topic.matches()) {
            throw refused("Unknown destination");
        }
        ActiveMember member = principal.member();
        try {
            transactions.readInOrganization(
                    member.organizationId(),
                    () -> CurrentMember.callAs(member, () -> projects.readable(UUID.fromString(topic.group(1)))));
        } catch (ProblemException notVisible) {
            // 404 and 403 alike: the frame says no more than REST would.
            throw refused("Project not found");
        }
    }

    private static Optional<UUID> parse(String header) {
        try {
            return header == null ? Optional.empty() : Optional.of(UUID.fromString(header.strip()));
        } catch (IllegalArgumentException malformed) {
            return Optional.empty();
        }
    }

    /** Becomes a STOMP {@code ERROR} frame and closes the connection. */
    private static MessageDeliveryException refused(String reason) {
        return new MessageDeliveryException(reason);
    }
}
