package com.kora.organization.adapter.persistence;

import com.kora.organization.application.InvitationRepository;
import com.kora.organization.domain.Invitation;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

interface JpaInvitationRepository extends Repository<Invitation, UUID>, InvitationRepository {

    @Override
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select i from Invitation i where i.tokenHash = :tokenHash")
    Optional<Invitation> lockByTokenHash(@Param("tokenHash") String tokenHash);

    @Override
    @Modifying
    @Query("""
            update Invitation i set i.status = com.kora.organization.domain.InvitationStatus.EXPIRED, i.decidedAt = :now
            where i.status = com.kora.organization.domain.InvitationStatus.PENDING and i.expiresAt <= :now
            """)
    int expirePendingBefore(@Param("now") Instant now);
}
