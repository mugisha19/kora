package com.kora.reports;

import java.util.Locale;
import java.util.UUID;

/** Text for a report in the requester's language (en, fr, rw), from {@code messages/reports*.properties}. */
public interface ReportLabels {

    Locale locale();

    /** The message {@code key} with its arguments. */
    String text(String key, Object... args);

    /** An enum value's label ({@code report.value.<Type>.<NAME>}), or the name in plain words when there is none. */
    default String value(Enum<?> value) {
        return value == null ? "" : value(value.getDeclaringClass().getSimpleName(), value.name());
    }

    /** The same for a value another module passes by name, e.g. {@code value("Health", "AMBER")}. */
    String value(String type, String name);

    /** "Yes" or "No". */
    default String yesNo(boolean value) {
        return text(value ? "report.yes" : "report.no");
    }

    /** A person's full name, also for people who have left the organization; blank for null. */
    String person(UUID userId);
}
