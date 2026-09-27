package com.kora.schedule.application;

import com.kora.platform.error.ConflictException;
import com.kora.platform.error.FieldViolation;
import com.kora.portfolio.ProjectRef;
import com.kora.schedule.ScheduleErrorCodes;
import com.kora.work.SchedulableTask;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Rules the dependency and schedule use cases share. */
final class ScheduleRules {

    /** Dependencies and baselines belong to plan-driven delivery; an Agile project plans in sprints. */
    private static final Set<String> SCHEDULED = Set.of("PREDICTIVE", "HYBRID");

    private ScheduleRules() {}

    static boolean isPredictive(ProjectRef project) {
        return SCHEDULED.contains(project.methodology());
    }

    static void requirePredictive(ProjectRef project) {
        if (!isPredictive(project)) {
            throw new ConflictException(
                    ScheduleErrorCodes.NOT_PREDICTIVE,
                    "Dependencies and baselines are for Predictive and Hybrid projects; this one is Agile");
        }
    }

    /**
     * {@code 409 schedule.cycle}, naming the loop by task keys in {@code errors[0].params.cycle} so the web app can
     * show the offending chain.
     */
    static ConflictException cycle(List<UUID> loop, List<SchedulableTask> tasks, String field) {
        Map<UUID, String> keys = tasks.stream().collect(Collectors.toMap(SchedulableTask::id, SchedulableTask::key));
        List<String> named =
                loop.stream().map(id -> keys.getOrDefault(id, id.toString())).toList();
        String chain = String.join(" → ", named);
        return new ConflictException(
                ScheduleErrorCodes.CYCLE,
                "The dependencies would form a loop: " + chain,
                List.of(new FieldViolation(
                        field, ScheduleErrorCodes.CYCLE, "would close the loop " + chain, Map.of("cycle", named))));
    }

    static Map<UUID, SchedulableTask> byId(List<SchedulableTask> tasks) {
        return tasks.stream().collect(Collectors.toMap(SchedulableTask::id, Function.identity()));
    }
}
