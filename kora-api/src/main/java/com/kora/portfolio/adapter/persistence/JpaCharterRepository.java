package com.kora.portfolio.adapter.persistence;

import com.kora.portfolio.application.PortfolioRepositories;
import com.kora.portfolio.domain.Charter;
import java.util.UUID;
import org.springframework.data.repository.Repository;

interface JpaCharterRepository extends Repository<Charter, UUID>, PortfolioRepositories.CharterRepository {}
