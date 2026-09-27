package com.kora.governance.application;

import com.kora.governance.domain.ChangeControlSettings;
import java.util.Optional;

/** Persistence port for the change-control thresholds: at most one row, the active organization's. */
public interface ChangeControlSettingsRepository {

    Optional<ChangeControlSettings> findFirstBy();

    ChangeControlSettings saveAndFlush(ChangeControlSettings settings);
}
