package com.kora.scope.application;

import com.kora.scope.WorkPackageProgress;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

/**
 * Task progress when the work module is present. Scope doesn't depend on work (work depends on scope), so it looks
 * the implementation up at runtime and simply has no task progress in a test that runs scope alone.
 */
@Component
class TaskProgress {

    private final ObjectProvider<WorkPackageProgress> progress;

    TaskProgress(ObjectProvider<WorkPackageProgress> progress) {
        this.progress = progress;
    }

    Map<UUID, BigDecimal> of(UUID projectId) {
        WorkPackageProgress implementation = progress.getIfAvailable();
        return implementation == null ? Map.of() : implementation.byWorkPackage(projectId);
    }
}
