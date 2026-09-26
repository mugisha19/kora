package com.kora.portfolio.adapter.persistence;

import com.kora.portfolio.application.OwnerCount;
import com.kora.portfolio.application.PortfolioRepositories;
import com.kora.portfolio.domain.Program;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

interface JpaProgramRepository extends Repository<Program, UUID>, PortfolioRepositories.ProgramRepository {

    @Override
    @Query("""
            select new com.kora.portfolio.application.OwnerCount(p.portfolioId, count(p))
            from Program p where p.portfolioId in :ids group by p.portfolioId
            """)
    List<OwnerCount> countByPortfolio(@Param("ids") Collection<UUID> portfolioIds);
}
