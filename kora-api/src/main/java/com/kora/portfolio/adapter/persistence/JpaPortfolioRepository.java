package com.kora.portfolio.adapter.persistence;

import com.kora.portfolio.application.PortfolioRepositories;
import com.kora.portfolio.application.PortfolioRepositories.PortfolioSearch;
import com.kora.portfolio.domain.Portfolio;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.repository.Repository;

interface JpaPortfolioRepository
        extends Repository<Portfolio, UUID>,
                JpaSpecificationExecutor<Portfolio>,
                PortfolioRepositories.PortfolioRepository {

    @Override
    default Page<Portfolio> search(PortfolioSearch search, Pageable pageable) {
        return findAll(PortfolioSpecifications.portfolios(search), pageable);
    }
}
