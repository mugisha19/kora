package com.kora.identity.adapter.persistence;

import com.kora.identity.application.PasswordResetTokenRepository;
import com.kora.identity.domain.PasswordResetToken;
import org.springframework.data.repository.Repository;

interface JpaPasswordResetTokenRepository
        extends Repository<PasswordResetToken, String>, PasswordResetTokenRepository {}
