package com.kora.governance.adapter.persistence;

import com.kora.governance.application.ChangeControlSettingsRepository;
import com.kora.governance.domain.ChangeControlSettings;
import java.util.UUID;
import org.springframework.data.repository.Repository;

interface JpaChangeControlSettingsRepository
        extends Repository<ChangeControlSettings, UUID>, ChangeControlSettingsRepository {}
