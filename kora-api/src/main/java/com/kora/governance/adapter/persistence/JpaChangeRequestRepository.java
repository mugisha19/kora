package com.kora.governance.adapter.persistence;

import com.kora.governance.application.ChangeRequestRepository;
import com.kora.governance.domain.ChangeRequest;
import java.util.UUID;
import org.springframework.data.repository.Repository;

interface JpaChangeRequestRepository extends Repository<ChangeRequest, UUID>, ChangeRequestRepository {}
