package com.kora.work;

import java.util.List;
import java.util.UUID;

/** Read access for other modules. No access check: callers check the project with {@code ProjectAccess} first. */
public interface WorkQueries {

    /** Every task of the project, in rank order. */
    List<SchedulableTask> schedulable(UUID projectId);
}
