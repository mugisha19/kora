package com.kora.scope.application;

import com.kora.scope.WbsQueries;
import com.kora.scope.WbsTotals;
import com.kora.scope.domain.WbsComponent;
import com.kora.scope.domain.WbsTree;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class WbsQueriesService implements WbsQueries {

    private final WbsNodeRepository nodes;

    WbsQueriesService(WbsNodeRepository nodes) {
        this.nodes = nodes;
    }

    @Override
    @Transactional(readOnly = true)
    public WbsTotals totals(UUID projectId, String currency) {
        WbsComponent totals =
                WbsTree.of(nodes.findByProjectId(projectId), currency).totals();
        return new WbsTotals(
                totals.plannedEffortHours(), totals.plannedCost(), totals.percentComplete(), totals.earnedValue());
    }
}
