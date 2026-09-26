package com.kora.support;

import static org.awaitility.Awaitility.await;

import com.kora.platform.mail.EmailMessage;
import com.kora.platform.mail.EmailSender;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Replaces SMTP in integration tests and keeps every message, so tests can read links out of emails. Emails are sent
 * asynchronously after commit, hence the waiting lookups. Tests use unique addresses, so they never see each
 * other's mail although the recorder is shared.
 */
public class RecordingEmailSender implements EmailSender {

    private static final Duration WAIT = Duration.ofSeconds(10);

    private final ConcurrentLinkedQueue<EmailMessage> sent = new ConcurrentLinkedQueue<>();

    @Override
    public void send(EmailMessage message) {
        sent.add(message);
    }

    public List<EmailMessage> sentTo(String address) {
        return sent.stream()
                .filter(message -> message.to().equalsIgnoreCase(address))
                .toList();
    }

    /** Waits for the {@code n}-th (1-based) email to {@code address}. */
    public EmailMessage awaitEmail(String address, int n) {
        await().atMost(WAIT).until(() -> sentTo(address).size() >= n);
        return sentTo(address).get(n - 1);
    }

    /** The token at the end of the first link in {@code message} whose path contains {@code pathMarker}. */
    public static String tokenFrom(EmailMessage message, String pathMarker) {
        Matcher matcher =
                Pattern.compile(Pattern.quote(pathMarker) + "([A-Za-z0-9_-]+)").matcher(message.body());
        return Optional.of(matcher)
                .filter(Matcher::find)
                .map(found -> found.group(1))
                .orElseThrow(() -> new AssertionError("No link with " + pathMarker + " in: " + message.body()));
    }
}
