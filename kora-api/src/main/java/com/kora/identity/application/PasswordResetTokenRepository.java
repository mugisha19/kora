package com.kora.identity.application;

import com.kora.identity.domain.PasswordResetToken;
import java.util.Optional;

/** Persistence port for password reset tokens, looked up by the hash of the emailed token. */
public interface PasswordResetTokenRepository {

    Optional<PasswordResetToken> findById(String tokenHash);

    PasswordResetToken save(PasswordResetToken token);
}
