package com.kora.scope.application;

import com.kora.scope.WbsQueries;
import com.kora.scope.WbsQueries.WorkPackageFigures;
import com.kora.scope.WbsTotals;
import com.kora.scope.domain.WbsComponent;
import com.kora.scope.domain.WbsNodeType;
import com.kora.scope.domain.WbsTree;
import java.util.ArrayList;
import java.util.List;
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

    @Override
    @Transactional(readOnly = true)
    public List<WorkPackageFigures> workPackages(UUID projectId, String currency) {
        List<WorkPackageFigures> figures = new ArrayList<>();
        collect(
                WbsTree.of(nodes.findByProjectId(projectId), currency, taskProgress.of(projectId))
                        .roots(),
                figures);
        return figures;
    }

    private static void collect(List<WbsTree.Entry> entries, List<WorkPackageFigures> figures) {
        for (WbsTree.Entry entry : entries) {
            if (entry.node().getType() == WbsNodeType.WORK_PACKAGE) {
                figures.add(new WorkPackageFigures(
                        entry.node().getId(),
                        entry.figures().plannedCost(),
                        entry.figures().percentComplete()));
            }
            collect(entry.children(), figures);
        }
    }
}
