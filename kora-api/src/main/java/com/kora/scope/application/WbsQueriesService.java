package com.kora.scope.application;

import com.kora.scope.WbsQueries;
import com.kora.scope.WbsTotals;
import com.kora.scope.domain.WbsComponent;
import com.kora.scope.domain.WbsNodeType;
import com.kora.scope.domain.WbsTree;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class WbsQueriesService implements WbsQueries {

    private final WbsNodeRepository nodes;
    private final TaskProgress taskProgress;

    WbsQueriesService(WbsNodeRepository nodes, TaskProgress taskProgress) {
        this.nodes = nodes;
        this.taskProgress = taskProgress;
    }

    @Override
    @Transactional(readOnly = true)
    public WbsTotals totals(UUID projectId, String currency) {
        WbsComponent totals = WbsTree.of(nodes.findByProjectId(projectId), currency, taskProgress.of(projectId))
                .totals();
        return new WbsTotals(
                totals.plannedEffortHours(), totals.plannedCost(), totals.percentComplete(), totals.earnedValue());
    }

    @Override
    @Transactional(readOnly = true)
    public boolean isWorkPackage(UUID projectId, UUID nodeId) {
        return nodes.findById(nodeId)
                .filter(node -> node.getProjectId().equals(projectId))
                .filter(node -> node.getType() == WbsNodeType.WORK_PACKAGE)
                .isPresent();
    }
}
