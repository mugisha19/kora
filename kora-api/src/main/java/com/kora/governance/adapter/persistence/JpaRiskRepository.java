package com.kora.governance.adapter.persistence;

import com.kora.governance.application.RiskRepository;
import com.kora.governance.application.RiskSearch;
import com.kora.governance.domain.Risk;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.repository.Repository;

interface JpaRiskRepository extends Repository<Risk, UUID>, JpaSpecificationExecutor<Risk>, RiskRepository {

    @Override
    default Page<Risk> search(RiskSearch search, Pageable pageable) {
        return findAll(GovernanceSpecifications.risks(search), pageable);
    }

    @Override
    default List<Risk> search(RiskSearch search) {
        return findAll(GovernanceSpecifications.risks(search));
    }
}
