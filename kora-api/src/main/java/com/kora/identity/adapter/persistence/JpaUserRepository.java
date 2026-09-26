package com.kora.identity.adapter.persistence;

import com.kora.identity.application.UserRepository;
import com.kora.identity.domain.User;
import java.util.UUID;
import org.springframework.data.repository.Repository;

/** Spring Data implements the {@link UserRepository} port directly from its method names. */
interface JpaUserRepository extends Repository<User, UUID>, UserRepository {}
