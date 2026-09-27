package com.kora.notifications.adapter.persistence;

import com.kora.notifications.application.PreferenceRepository;
import com.kora.notifications.domain.NotificationPreference;
import org.springframework.data.repository.Repository;

interface JpaPreferenceRepository
        extends Repository<NotificationPreference, NotificationPreference.Key>, PreferenceRepository {}
