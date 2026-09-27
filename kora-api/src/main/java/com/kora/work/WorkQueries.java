package com.kora.work;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Read access for other modules. No access check: callers check the project with {@code ProjectAccess} first. */
public interface WorkQueries {

    /** Every task of the project, in rank order. */
    List<SchedulableTask> schedulable(UUID projectId);

    /** The tasks with these ids; unknown ids are simply absent. */
    Map<UUID, TaskRef> tasks(Collection<UUID> taskIds);

    /** The work package of each task that is planned under one, by task id. */
    Map<UUID, UUID> workPackagesOfTasks(UUID projectId);

    /** Story points finished and in total, for earned value by story points. */
    StoryPoints storyPoints(UUID projectId);

    record TaskRef(UUID id, UUID projectId, String key, String title) {}

    record StoryPoints(int done, int total) {}
}
