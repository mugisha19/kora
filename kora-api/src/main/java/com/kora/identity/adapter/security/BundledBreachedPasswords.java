package com.kora.identity.adapter.security;

import com.kora.identity.domain.BreachedPasswords;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * Breached-password check against a list bundled with the application ({@code identity/breached-passwords.txt}),
 * compared case-insensitively. Offline and instant; a larger list or a Have I Been Pwned k-anonymity adapter can
 * replace it behind the same port (ADR 0007).
 */
@Component
class BundledBreachedPasswords implements BreachedPasswords {

    private static final String LIST = "identity/breached-passwords.txt";

    private final Set<String> passwords;

    BundledBreachedPasswords() {
        ClassPathResource resource = new ClassPathResource(LIST);
        try (BufferedReader reader =
                new BufferedReader(new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
            passwords = reader.lines()
                    .map(String::strip)
                    .filter(line -> !line.isEmpty() && !line.startsWith("#"))
                    .map(line -> line.toLowerCase(Locale.ROOT))
                    .collect(Collectors.toUnmodifiableSet());
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read " + LIST, e);
        }
    }

    @Override
    public boolean contains(String password) {
        return passwords.contains(password.toLowerCase(Locale.ROOT));
    }
}
