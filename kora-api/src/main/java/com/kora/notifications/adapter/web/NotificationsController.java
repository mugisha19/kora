package com.kora.notifications.adapter.web;

import com.kora.notifications.application.NotificationService;
import com.kora.notifications.application.NotificationService.Channels;
import com.kora.notifications.application.NotificationService.Page;
import com.kora.notifications.domain.NotificationType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code Notifications} (feature 18). */
@RestController
class NotificationsController {

    private final NotificationService notifications;

    NotificationsController(NotificationService notifications) {
        this.notifications = notifications;
    }

    record NotificationPageResponse(List<NotificationResponse> items, String nextCursor, long unreadCount) {}

    record PreferenceBody(
            @NotNull NotificationType type,
            @NotNull Boolean inApp,
            @NotNull Boolean email) {}

    record PreferencesBody(@NotNull @Size(max = 20) List<@Valid @NotNull PreferenceBody> preferences) {}

    @GetMapping("/api/v1/notifications")
    NotificationPageResponse list(
            @RequestParam(name = "unread", defaultValue = "false") boolean unread,
            @RequestParam(name = "cursor", required = false) @Size(max = 200) String cursor,
            @RequestParam(name = "limit", defaultValue = "20") @Min(1) @Max(100) int limit) {
        Page page = notifications.list(unread, cursor, limit);
        return new NotificationPageResponse(
                page.items().stream().map(NotificationResponse::of).toList(), page.nextCursor(), page.unreadCount());
    }

    @PostMapping("/api/v1/notifications/{notificationId}/read")
    NotificationResponse markRead(@PathVariable("notificationId") UUID notificationId) {
        return NotificationResponse.of(notifications.markRead(notificationId));
    }

    @PostMapping("/api/v1/notifications/read-all")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void markAllRead() {
        notifications.markAllRead();
    }

    @GetMapping("/api/v1/me/notification-preferences")
    PreferencesBody preferences() {
        return body(notifications.preferences());
    }

    @PutMapping("/api/v1/me/notification-preferences")
    PreferencesBody choose(@Valid @RequestBody PreferencesBody request) {
        return body(notifications.choose(request.preferences().stream()
                .map(chosen -> new Channels(chosen.type(), chosen.inApp(), chosen.email()))
                .toList()));
    }

    private static PreferencesBody body(List<Channels> channels) {
        return new PreferencesBody(channels.stream()
                .map(one -> new PreferenceBody(one.type(), one.inApp(), one.email()))
                .toList());
    }
}
