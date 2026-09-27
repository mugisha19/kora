package com.kora.work.adapter.persistence;

import com.kora.work.application.SprintRepository;
import com.kora.work.domain.Sprint;
import java.util.UUID;
import org.springframework.data.repository.Repository;

interface JpaSprintRepository extends Repository<Sprint, UUID>, SprintRepository {}
