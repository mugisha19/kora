package com.kora.notifications.application;

import com.kora.identity.CurrentUser;
import com.kora.notifications.domain.Notification;
import com.kora.notifications.domain.NotificationPreference;
import com.kora.notifications.domain.NotificationType;
import com.kora.organization.CurrentMember;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.PlatformErrorCodes;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A person's own notifications (feature 18). Every member may read theirs, so there is no role check: the query is
 * always narrowed to the caller, and someone else's notification is simply not found.
 */
@Service
public class NotificationService {

    private final NotificationRepository notifications;
    private final PreferenceRepository preferences;
    private final Clock clock;

    NotificationService(NotificationRepository notifications, PreferenceRepository preferences, Clock clock) {
        this.notifications = notifications;
        this.preferences = preferences;
        this.clock = clock;
    }

    /** One page, newest first; {@code nextCursor} is null on the last page. */
    public record Page(List<Notification> items, String nextCursor, long unreadCount) {}

    public record Channels(NotificationType type, boolean inApp, boolean email) {}

    @Transactional(readOnly = true)
    public Page list(boolean unreadOnly, String cursor, int limit) {
        UUID me = CurrentMember.get().userId();
        Cursor after = Cursor.parse(cursor);
        List<Notification> found = notifications.page(
                me, unreadOnly, after == null ? null : after.createdAt(), after == null ? null : after.id(), limit + 1);
        long unread = notifications.countByUserIdAndReadAtIsNull(me);
        if (found.size() <= limit) {
            return new Page(found, null, unread);
        }
        List<Notification> items = List.copyOf(found.subList(0, limit));
        Notification last = items.getLast();
        return new Page(items, new Cursor(last.getCreatedAt(), last.getId()).encode(), unread);
    }

    @Transactional
    public Notification markRead(UUID notificationId) {
        UUID me = CurrentMember.get().userId();
        Notification notification = notifications
                .findById(notificationId)
                .filter(found -> found.getUserId().equals(me))
                .orElseThrow(() -> NotFoundException.of("notification", notificationId));
        notification.markRead(clock.instant());
        return notifications.save(notification);
    }

    @Transactional
    public void markAllRead() {
        notifications.markAllRead(CurrentMember.get().userId(), clock.instant());
    }

    /** Every kind, with the defaults for kinds never chosen. Not tied to an organization. */
    @Transactional(readOnly = true)
    public List<Channels> preferences() {
        return channelsOf(CurrentUser.id());
    }

    /** Kinds left out keep their current setting. */
    @Transactional
    public List<Channels> choose(List<Channels> chosen) {
        UUID me = CurrentUser.id();
        for (Channels channels : chosen) {
            NotificationPreference preference = preferences
                    .findByUserIdAndType(me, channels.type())
                    .orElseGet(() -> NotificationPreference.standard(me, channels.type()));
            preference.choose(channels.inApp(), channels.email());
            preferences.save(preference);
        }
        return channelsOf(me);
    }

    /** What applies to one person and kind, for the dispatcher. */
    @Transactional(readOnly = true)
    public Channels channelsFor(UUID userId, NotificationType type) {
        NotificationPreference preference = preferences
                .findByUserIdAndType(userId, type)
                .orElseGet(() -> NotificationPreference.standard(userId, type));
        return new Channels(type, preference.isInApp(), preference.isEmail());
    }

    private List<Channels> channelsOf(UUID userId) {
        Map<NotificationType, NotificationPreference> chosen = new EnumMap<>(NotificationType.class);
        preferences.findByUserId(userId).forEach(preference -> chosen.put(preference.getType(), preference));
        List<Channels> all = new ArrayList<>();
        for (NotificationType type : NotificationType.values()) {
            NotificationPreference preference =
                    chosen.getOrDefault(type, NotificationPreference.standard(userId, type));
            all.add(new Channels(type, preference.isInApp(), preference.isEmail()));
        }
        return all;
    }

    /** Opaque to clients: the creation time and id of the last item, to continue below. */
    private record Cursor(Instant createdAt, UUID id) {

        String encode() {
            String raw = "n:" + createdAt.toEpochMilli() + ":" + createdAt.getNano() + ":" + id;
            return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
        }

        static Cursor parse(String cursor) {
            if (cursor == null || cursor.isBlank()) {
                return null;
            }
            try {
                String[] parts = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8).split(":");
                if (parts.length == 4 && parts[0].equals("n")) {
                    Instant millis = Instant.ofEpochMilli(Long.parseLong(parts[1]));
                    return new Cursor(
                            millis.plusNanos(Long.parseLong(parts[2]) % 1_000_000), UUID.fromString(parts[3]));
                }
            } catch (IllegalArgumentException malformed) {
                // reported below
            }
            throw new InvalidInputException(FieldViolation.of(
                    "cursor", PlatformErrorCodes.Field.INVALID, "use the nextCursor of the previous page"));
        }
    }
}
