package com.kora.portfolio.adapter.persistence;

import com.kora.portfolio.application.PortfolioRepositories;
import com.kora.portfolio.domain.ProjectMember;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

interface JpaProjectMemberRepository
        extends Repository<ProjectMember, UUID>, PortfolioRepositories.ProjectMemberRepository {

    @Override
    @Query("select m.projectId from ProjectMember m where m.userId = :userId")
    Set<UUID> findProjectIdsByUserId(@Param("userId") UUID userId);
}
