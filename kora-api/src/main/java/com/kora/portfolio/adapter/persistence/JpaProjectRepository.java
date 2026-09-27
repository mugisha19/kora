package com.kora.portfolio.adapter.persistence;

import com.kora.portfolio.application.OwnerCount;
import com.kora.portfolio.application.PortfolioRepositories;
import com.kora.portfolio.application.PortfolioRepositories.ProjectSearch;
import com.kora.portfolio.domain.Project;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

interface JpaProjectRepository
        extends Repository<Project, UUID>, JpaSpecificationExecutor<Project>, PortfolioRepositories.ProjectRepository {

    @Override
    default Page<Project> search(ProjectSearch search, Pageable pageable) {
        return findAll(PortfolioSpecifications.projects(search), pageable);
    }

    @Override
    @Query("""
            select new com.kora.portfolio.application.OwnerCount(p.portfolioId, count(p))
            from Project p where p.portfolioId in :ids group by p.portfolioId
            """)
    List<OwnerCount> countByPortfolio(@Param("ids") Collection<UUID> portfolioIds);

    @Override
    @Query("""
            select new com.kora.portfolio.application.OwnerCount(p.programId, count(p))
            from Project p where p.programId in :ids group by p.programId
            """)
    List<OwnerCount> countByProgram(@Param("ids") Collection<UUID> programIds);

    @Override
    @Query("select p.id from Project p where p.managerId = :managerId")
    Set<UUID> findIdsByManagerId(@Param("managerId") UUID managerId);

    @Override
    @Query("select p.id from Project p where p.portfolioId = :portfolioId")
    Set<UUID> findIdsByPortfolioId(@Param("portfolioId") UUID portfolioId);
}
