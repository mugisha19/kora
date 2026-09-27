package com.kora.notifications.domain;

import java.util.Locale;

/** What a notification is about; each has its own translation key and default channels. */
public enum NotificationType {
    TASK_ASSIGNED(true),
    APPROVAL_REQUESTED(true),
    CHANGE_REQUEST_DECIDED(false),
    TIMESHEET_DECIDED(false),
    RISK_REVIEW_OVERDUE(false),
    ISSUE_ESCALATED(false);

    private final boolean emailByDefault;

    NotificationType(boolean emailByDefault) {
        this.emailByDefault = emailByDefault;
    }

    /** Everything shows in the app; only what someone must act on is also emailed, until they choose otherwise. */
    public boolean emailByDefault() {
        return emailByDefault;
    }

    public String titleKey() {
        return "notifications." + name().toLowerCase(Locale.ROOT);
    }
}
