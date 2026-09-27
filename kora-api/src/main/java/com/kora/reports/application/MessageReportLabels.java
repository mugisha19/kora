package com.kora.reports.application;

import com.kora.identity.UserAccounts;
import com.kora.organization.MemberDirectory;
import com.kora.organization.MemberSummary;
import com.kora.reports.ReportLabels;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.MessageSource;
import org.springframework.context.NoSuchMessageException;

/** {@link ReportLabels} from the message bundles, with names looked up once per report. */
class MessageReportLabels implements ReportLabels {

    private final MessageSource messages;
    private final MemberDirectory members;
    private final UserAccounts accounts;
    private final Locale locale;
    private final Map<UUID, String> names = new HashMap<>();

    MessageReportLabels(MessageSource messages, MemberDirectory members, UserAccounts accounts, Locale locale) {
        this.messages = messages;
        this.members = members;
        this.accounts = accounts;
        this.locale = locale;
    }

    @Override
    public Locale locale() {
        return locale;
    }

    @Override
    public String text(String key, Object... args) {
        return messages.getMessage(key, args, locale);
    }

    @Override
    public String value(String type, String name) {
        if (name == null || name.isBlank()) {
            return "";
        }
        try {
            return messages.getMessage("report.value." + type + "." + name, null, locale);
        } catch (NoSuchMessageException missing) {
            String words = name.replace('_', ' ').toLowerCase(Locale.ROOT);
            return Character.toUpperCase(words.charAt(0)) + words.substring(1);
        }
    }

    @Override
    public String person(UUID userId) {
        if (userId == null) {
            return "";
        }
        return names.computeIfAbsent(
                userId,
                id -> members.find(id)
                        .map(MemberSummary::fullName)
                        // Someone who has left keeps their name on what they did.
                        .orElseGet(() -> accounts.get(id).fullName()));
    }
}
