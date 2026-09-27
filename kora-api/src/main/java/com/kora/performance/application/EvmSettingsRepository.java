package com.kora.performance.application;

import com.kora.performance.domain.EvmSettings;
import java.util.Optional;
import java.util.UUID;

/** Persistence port for EVM settings (tenant-filtered). */
public interface EvmSettingsRepository {

    Optional<EvmSettings> findById(UUID projectId);

    EvmSettings saveAndFlush(EvmSettings settings);
}
