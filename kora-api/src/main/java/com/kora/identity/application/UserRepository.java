package com.kora.identity.application;

import com.kora.identity.domain.User;
import java.util.Optional;
import java.util.UUID;

/** Persistence port for users; implemented by a Spring Data repository in {@code adapter.persistence}. */
public interface UserRepository {

    Optional<User> findById(UUID id);

    /** @param email already normalized */
    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    User save(User user);
}
