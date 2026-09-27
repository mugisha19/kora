package com.kora.governance.adapter.persistence;

import com.kora.governance.application.RiskAssessmentRepository;
import com.kora.governance.domain.RiskAssessment;
import java.util.UUID;
import org.springframework.data.repository.Repository;

interface JpaRiskAssessmentRepository extends Repository<RiskAssessment, UUID>, RiskAssessmentRepository {}
