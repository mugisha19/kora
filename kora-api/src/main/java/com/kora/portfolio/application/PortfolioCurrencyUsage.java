package com.kora.portfolio.application;

import com.kora.organization.CurrencyUsage;
import com.kora.portfolio.application.PortfolioRepositories.CharterRepository;
import com.kora.portfolio.application.PortfolioRepositories.ProjectRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Project budgets and charter budgets are amounts in the organization's currency. */
@Component
class PortfolioCurrencyUsage implements CurrencyUsage {

    private final ProjectRepository projects;
    private final CharterRepository charters;

    PortfolioCurrencyUsage(ProjectRepository projects, CharterRepository charters) {
        this.projects = projects;
        this.charters = charters;
    }

    @Override
    @Transactional(readOnly = true)
    public boolean currencyInUse() {
        return projects.existsByBudgetAmountIsNotNull() || charters.existsBySummaryBudgetAmountIsNotNull();
    }
}
