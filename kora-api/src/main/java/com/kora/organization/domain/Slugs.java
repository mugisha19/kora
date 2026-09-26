package com.kora.organization.domain;

import java.text.Normalizer;
import java.util.Locale;

/** URL-friendly organization names: "Akagera Digital Ltd" becomes {@code akagera-digital-ltd}. */
public final class Slugs {

    private static final int MAX_LENGTH = 100;

    private Slugs() {}

    public static String from(String name) {
        String ascii = Normalizer.normalize(name, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        String slug =
                ascii.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-+)|(-+$)", "");
        if (slug.length() > MAX_LENGTH) {
            slug = slug.substring(0, MAX_LENGTH).replaceAll("-+$", "");
        }
        return slug.isEmpty() ? "organization" : slug;
    }

    /** The {@code n}-th alternative when the plain slug is taken: {@code name-2}, {@code name-3}... */
    public static String alternative(String slug, int n) {
        return slug + "-" + n;
    }
}
