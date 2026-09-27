package com.kora.resourcing.adapter.persistence;

import com.kora.resourcing.application.CostRateRepository;
import com.kora.resourcing.domain.CostRate;
import java.util.UUID;
import org.springframework.data.repository.Repository;

interface JpaCostRateRepository extends Repository<CostRate, UUID>, CostRateRepository {}
