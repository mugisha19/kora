package com.kora.identity.application;

import com.kora.identity.AccountView;
import com.kora.identity.IdentityErrorCodes;
import com.kora.identity.UserAccounts;
import com.kora.identity.UserLocale;
import com.kora.identity.domain.EmailAddresses;
import com.kora.identity.domain.PasswordPolicy;
import com.kora.identity.domain.User;
import com.kora.platform.error.ConflictException;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.UnauthenticatedException;
import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class UserAccountsService implements UserAccounts {

    private final UserRepository users;
    private final PasswordHasher hasher;
    private final PasswordPolicy passwordPolicy;
    private final Clock clock;

    /**
     * Hash compared against when the email is unknown, so an unknown email costs the same Argon2 work as a wrong
     * password and response times don't reveal which accounts exist.
     */
    private final String dummyHash;

    UserAccountsService(UserRepository users, PasswordHasher hasher, PasswordPolicy passwordPolicy, Clock clock) {
        this.users = users;
        this.hasher = hasher;
        this.passwordPolicy = passwordPolicy;
        this.clock = clock;
        this.dummyHash = hasher.hash(UUID.randomUUID().toString());
    }

    @Override
    @Transactional
    public UUID createAccount(String email, String fullName, String password, UserLocale locale) {
        String normalized = EmailAddresses.normalize(email);
        if (users.existsByEmail(normalized)) {
            throw new ConflictException(
                    IdentityErrorCodes.EMAIL_TAKEN,
                    "An account with this email already exists",
                    List.of(FieldViolation.of(
                            "email", IdentityErrorCodes.EMAIL_TAKEN, "An account with this email already exists")));
        }
        passwordPolicy.check("password", password);
        User user = User.register(normalized, hasher.hash(password), fullName, locale, clock.instant());
        return users.save(user).getId();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<AccountView> findByEmail(String email) {
        return users.findByEmail(EmailAddresses.normalize(email)).map(UserAccountsService::view);
    }

    @Override
    @Transactional(readOnly = true)
    public AccountView get(UUID userId) {
        return users.findById(userId)
                .map(UserAccountsService::view)
                .orElseThrow(() -> NotFoundException.of("User", userId));
    }

    @Override
    @Transactional(readOnly = true)
    public UUID authenticate(String email, String password) {
        Optional<User> user = users.findByEmail(EmailAddresses.normalize(email));
        // Always run exactly one hash comparison, whether or not the account exists.
        boolean passwordMatches =
                hasher.matches(password, user.map(User::getPasswordHash).orElse(dummyHash));
        if (user.isEmpty() || !passwordMatches || !user.get().isEnabled()) {
            throw invalidCredentials();
        }
        return user.get().getId();
    }

    static UnauthenticatedException invalidCredentials() {
        return new UnauthenticatedException(
                IdentityErrorCodes.INVALID_CREDENTIALS, "The email or password is incorrect");
    }

    private static AccountView view(User user) {
        return new AccountView(user.getId(), user.getEmail(), user.getFullName(), user.getLocale());
    }
}
