package com.kora.organization.adapter.persistence;

import com.kora.organization.application.OrganizationRepository;
import com.kora.organization.domain.Organization;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

interface JpaOrganizationRepository extends Repository<Organization, UUID>, OrganizationRepository {

    @Override
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from Organization o where o.id = :id")
    Optional<Organization> lockById(@Param("id") UUID id);
}
