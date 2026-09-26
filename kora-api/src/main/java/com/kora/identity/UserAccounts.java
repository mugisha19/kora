package com.kora.identity;

import java.util.Optional;
import java.util.UUID;

/** Accounts as other modules may use them: create one, look one up, check a password. */
public interface UserAccounts {

    /**
     * Creates an account, joining the caller's transaction.
     *
     * @throws com.kora.platform.error.ConflictException {@code auth.email_taken} when the email already has an
     *     account
     * @throws com.kora.platform.error.InvalidInputException when the password is breached
     */
    UUID createAccount(String email, String fullName, String password, UserLocale locale);

    Optional<AccountView> findByEmail(String email);

    AccountView get(UUID userId);

    /**
     * Returns the account id when the email and password match an enabled account.
     *
     * @throws com.kora.platform.error.UnauthenticatedException {@code auth.invalid_credentials} otherwise, with the
     *     same message and the same work done whether the email is unknown or the password wrong
     */
    UUID authenticate(String email, String password);
}
