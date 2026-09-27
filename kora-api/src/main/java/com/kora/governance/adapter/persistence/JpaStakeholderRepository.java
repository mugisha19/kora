package com.kora.governance.adapter.persistence;

import com.kora.governance.application.StakeholderRepository;
import com.kora.governance.domain.Stakeholder;
import java.util.UUID;
import org.springframework.data.repository.Repository;

interface JpaStakeholderRepository extends Repository<Stakeholder, UUID>, StakeholderRepository {}
