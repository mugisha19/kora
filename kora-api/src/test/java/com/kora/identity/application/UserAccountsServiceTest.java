package com.kora.identity.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kora.identity.UserLocale;
import com.kora.identity.domain.PasswordPolicy;
import com.kora.identity.domain.User;
import com.kora.platform.error.ConflictException;
import com.kora.platform.error.UnauthenticatedException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Sign-in must not reveal which accounts exist: an unknown email costs exactly the same password-hash work as a wrong
 * password, and both fail with the same exception.
 */
class UserAccountsServiceTest {

    private final CountingHasher hasher = new CountingHasher();
    private final InMemoryUsers users = new InMemoryUsers();
    private UserAccountsService accounts;

    @BeforeEach
    void setUp() {
        accounts = new UserAccountsService(
                users,
                hasher,
                new PasswordPolicy(password -> false),
                Clock.fixed(Instant.parse("2026-09-26T10:00:00Z"), ZoneOffset.UTC));
        hasher.comparisons.set(0);
    }

    @Test
    void anUnknownEmailDoesTheSameHashWorkAsAWrongPassword() {
        accounts.createAccount("aline@example.com", "Aline", "correct-horse-staple", UserLocale.EN);
        hasher.comparisons.set(0);

        assertThatThrownBy(() -> accounts.authenticate("nobody@example.com", "whatever-password"))
                .isInstanceOf(UnauthenticatedException.class)
                .hasMessage("The email or password is incorrect");
        int unknownEmail = hasher.comparisons.getAndSet(0);
        assertThatThrownBy(() -> accounts.authenticate("aline@example.com", "wrong-password-1"))
                .isInstanceOf(UnauthenticatedException.class)
                .hasMessage("The email or password is incorrect");
        int wrongPassword = hasher.comparisons.get();

        assertThat(unknownEmail).isEqualTo(wrongPassword).isEqualTo(1);
    }

    @Test
    void authenticatesCaseInsensitively() {
        UUID id = accounts.createAccount("Aline@Example.com", "Aline", "correct-horse-staple", UserLocale.EN);

        assertThat(accounts.authenticate("  ALINE@example.COM ", "correct-horse-staple"))
                .isEqualTo(id);
    }

    @Test
    void refusesADuplicateEmailOnTheEmailField() {
        accounts.createAccount("aline@example.com", "Aline", "correct-horse-staple", UserLocale.EN);

        assertThatThrownBy(
                        () -> accounts.createAccount("ALINE@example.com", "Other", "another-passphrase", UserLocale.FR))
                .isInstanceOf(ConflictException.class)
                .satisfies(e -> assertThat(
                                ((ConflictException) e).violations().getFirst().field())
                        .isEqualTo("email"));
    }

    @Test
    void neverStoresTheRawPassword() {
        UUID id = accounts.createAccount("aline@example.com", "Aline", "correct-horse-staple", UserLocale.EN);

        assertThat(users.findById(id).orElseThrow().getPasswordHash()).isEqualTo("hashed:correct-horse-staple");
    }

    /** Fake Argon2: predictable hashes, and a count of comparisons (the expensive part in production). */
    static final class CountingHasher implements PasswordHasher {

        final AtomicInteger comparisons = new AtomicInteger();

        @Override
        public String hash(String rawPassword) {
            return "hashed:" + rawPassword;
        }

        @Override
        public boolean matches(String rawPassword, String hash) {
            comparisons.incrementAndGet();
            return hash.equals(hash(rawPassword));
        }
    }

    static final class InMemoryUsers implements UserRepository {

        private final Map<UUID, User> byId = new HashMap<>();

        @Override
        public Optional<User> findById(UUID id) {
            return Optional.ofNullable(byId.get(id));
        }

        @Override
        public Optional<User> findByEmail(String email) {
            return byId.values().stream()
                    .filter(user -> user.getEmail().equals(email))
                    .findFirst();
        }

        @Override
        public boolean existsByEmail(String email) {
            return findByEmail(email).isPresent();
        }

        @Override
        public User save(User user) {
            byId.put(user.getId(), user);
            return user;
        }
    }
}
