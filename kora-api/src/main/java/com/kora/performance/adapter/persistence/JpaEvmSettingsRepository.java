package com.kora.performance.adapter.persistence;

import com.kora.performance.application.EvmSettingsRepository;
import com.kora.performance.domain.EvmSettings;
import java.util.UUID;
import org.springframework.data.repository.Repository;

interface JpaEvmSettingsRepository extends Repository<EvmSettings, UUID>, EvmSettingsRepository {}
