package com.kora.schedule.adapter.persistence;

import com.kora.schedule.application.DependencyRepository;
import com.kora.schedule.domain.Dependency;
import java.util.UUID;
import org.springframework.data.repository.Repository;

interface JpaDependencyRepository extends Repository<Dependency, UUID>, DependencyRepository {}
