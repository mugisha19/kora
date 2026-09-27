package com.kora.schedule.adapter.persistence;

import com.kora.schedule.application.BaselineTaskRepository;
import com.kora.schedule.domain.BaselineTask;
import java.util.UUID;
import org.springframework.data.repository.Repository;

interface JpaBaselineTaskRepository extends Repository<BaselineTask, UUID>, BaselineTaskRepository {}
