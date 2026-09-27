package com.kora.schedule.adapter.persistence;

import com.kora.schedule.application.BaselineRepository;
import com.kora.schedule.domain.Baseline;
import java.util.UUID;
import org.springframework.data.repository.Repository;

interface JpaBaselineRepository extends Repository<Baseline, UUID>, BaselineRepository {}
