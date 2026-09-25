package com.kora.platform.web;

import java.util.OptionalLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * ETags for versioned resources are simply the aggregate's {@code version}, quoted: {@code "3"}. Clients echo the
 * value back in {@code If-Match}. A weak prefix ({@code W/"3"}) is tolerated because some proxies add it.
 */
public final class EntityTags {

    private static final Pattern VERSION_TAG = Pattern.compile("^(?:W/)?\"?(\\d{1,18})\"?$");

    private EntityTags() {}

    public static String of(long version) {
        return "\"" + version + "\"";
    }

    public static OptionalLong parse(String header) {
        if (header == null) {
            return OptionalLong.empty();
        }
        Matcher matcher = VERSION_TAG.matcher(header.strip());
        return matcher.matches() ? OptionalLong.of(Long.parseLong(matcher.group(1))) : OptionalLong.empty();
    }
}
