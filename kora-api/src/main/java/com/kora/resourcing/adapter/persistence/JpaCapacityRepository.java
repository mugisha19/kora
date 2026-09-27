package com.kora.resourcing.adapter.persistence;

import com.kora.resourcing.application.CapacityRepository;
import com.kora.resourcing.domain.CapacityPeriod;
import java.util.UUID;
import org.springframework.data.repository.Repository;

interface JpaCapacityRepository extends Repository<CapacityPeriod, UUID>, CapacityRepository {}
