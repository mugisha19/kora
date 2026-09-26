package com.kora.organization.application;

import com.kora.organization.domain.Invitation;
import com.kora.organization.domain.InvitationStatus;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/** Persistence port for invitations (tenant-filtered like every tenant-owned repository). */
public interface InvitationRepository {

    Optional<Invitation> findById(UUID id);

    Optional<Invitation> findByTokenHash(String tokenHash);

    /** Loads with a row lock, so two simultaneous accepts of one link can't both succeed. */
    Optional<Invitation> lockByTokenHash(String tokenHash);

    Optional<Invitation> findByEmailAndStatus(String email, InvitationStatus status);

    Page<Invitation> findAll(Pageable pageable);

    Page<Invitation> findByStatus(InvitationStatus status, Pageable pageable);

    /** Marks pending invitations past their expiry as expired. Across organizations: call in the system scope. */
    int expirePendingBefore(Instant now);

    Invitation save(Invitation invitation);

    Invitation saveAndFlush(Invitation invitation);
}
