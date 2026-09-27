package com.kora.resourcing.adapter.persistence;

import com.kora.resourcing.application.LeaveRepository;
import com.kora.resourcing.domain.Leave;
import java.util.UUID;
import org.springframework.data.repository.Repository;

interface JpaLeaveRepository extends Repository<Leave, UUID>, LeaveRepository {}
