package com.kora.governance.application;

import com.kora.governance.domain.RiskAssessment;
import java.util.List;
import java.util.UUID;

/** Persistence port for risk assessments. */
public interface RiskAssessmentRepository {

    List<RiskAssessment> findByRiskIdOrderByAssessedAtAsc(UUID riskId);

    RiskAssessment save(RiskAssessment assessment);
}
