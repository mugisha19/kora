package com.kora.schedule.domain;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The critical path method (feature 10), in O(V + E):
 *
 * <ol>
 *   <li>order the activities so every predecessor comes before its successors (Kahn), refusing loops;
 *   <li>forward pass: the earliest each activity can start and finish, from its links and constraint;
 *   <li>backward pass: the latest each can start and finish without moving the project's finish;
 *   <li>total float = late start − early start (0 on the critical path); free float = how far it can slip before
 *       its first successor has to move.
 * </ol>
 *
 * The four link types, with lag L, for predecessor p and successor s: FS: ES(s) ≥ EF(p) + L; SS: ES(s) ≥ ES(p) + L;
 * FF: EF(s) ≥ EF(p) + L; SF: EF(s) ≥ ES(p) + L. Nothing starts before day 0, the project start.
 */
public final class CriticalPathMethod implements SchedulingStrategy {

    @Override
    public Schedule schedule(List<Activity> activities, List<Link> links) {
        Map<UUID, Activity> byId = new HashMap<>();
        Map<UUID, Integer> inputOrder = new HashMap<>();
        for (Activity activity : activities) {
            byId.put(activity.id(), activity);
            inputOrder.put(activity.id(), inputOrder.size());
        }
        List<Link> valid = links.stream()
                .filter(link -> byId.containsKey(link.predecessor()) && byId.containsKey(link.successor()))
                .toList();
        List<UUID> order = new DependencyGraph(
                        byId.keySet().stream()
                                .sorted(Comparator.comparing(inputOrder::get))
                                .toList(),
                        valid)
                .topologicalOrder();
        Map<UUID, List<Link>> incoming = new HashMap<>();
        Map<UUID, List<Link>> outgoing = new HashMap<>();
        for (Link link : valid) {
            incoming.computeIfAbsent(link.successor(), id -> new ArrayList<>()).add(link);
            outgoing.computeIfAbsent(link.predecessor(), id -> new ArrayList<>())
                    .add(link);
        }

        Map<UUID, Integer> earlyStart = new HashMap<>();
        int finish = 0;
        for (UUID id : order) {
            Activity activity = byId.get(id);
            int start = Math.max(0, activity.notBefore());
            for (Link link : incoming.getOrDefault(id, List.of())) {
                start = Math.max(start, earliestStartAllowedBy(link, byId, earlyStart, activity.duration()));
            }
            earlyStart.put(id, start);
            finish = Math.max(finish, start + activity.duration());
        }

        Map<UUID, Integer> lateFinish = new HashMap<>();
        for (UUID id : order.reversed()) {
            Activity activity = byId.get(id);
            int latest = finish;
            for (Link link : outgoing.getOrDefault(id, List.of())) {
                latest = Math.min(latest, latestFinishAllowedBy(link, byId, lateFinish, activity.duration()));
            }
            lateFinish.put(id, latest);
        }

        Map<UUID, Timing> timings = new HashMap<>();
        for (UUID id : order) {
            int duration = byId.get(id).duration();
            int es = earlyStart.get(id);
            int lf = lateFinish.get(id);
            int freeFloat = freeFloat(id, byId, outgoing, earlyStart, finish);
            timings.put(id, new Timing(es, es + duration, lf - duration, lf, lf - duration - es, freeFloat));
        }
        List<UUID> scheduleOrder = new ArrayList<>(order);
        scheduleOrder.sort(Comparator.<UUID>comparingInt(id -> timings.get(id).earlyStart())
                .thenComparing(inputOrder::get));
        return new Schedule(timings, scheduleOrder, finish);
    }

    private static int earliestStartAllowedBy(
            Link link, Map<UUID, Activity> activities, Map<UUID, Integer> earlyStart, int duration) {
        int predecessorStart = earlyStart.get(link.predecessor());
        int predecessorFinish =
                predecessorStart + activities.get(link.predecessor()).duration();
        return switch (link.type()) {
            case FS -> predecessorFinish + link.lag();
            case SS -> predecessorStart + link.lag();
            case FF -> predecessorFinish + link.lag() - duration;
            case SF -> predecessorStart + link.lag() - duration;
        };
    }

    private static int latestFinishAllowedBy(
            Link link, Map<UUID, Activity> activities, Map<UUID, Integer> lateFinish, int duration) {
        int successorFinish = lateFinish.get(link.successor());
        int successorStart = successorFinish - activities.get(link.successor()).duration();
        return switch (link.type()) {
            case FS -> successorStart - link.lag();
            case SS -> successorStart - link.lag() + duration;
            case FF -> successorFinish - link.lag();
            case SF -> successorFinish - link.lag() + duration;
        };
    }

    private static int freeFloat(
            UUID id,
            Map<UUID, Activity> activities,
            Map<UUID, List<Link>> outgoing,
            Map<UUID, Integer> earlyStart,
            int finish) {
        int start = earlyStart.get(id);
        int end = start + activities.get(id).duration();
        List<Link> links = outgoing.getOrDefault(id, List.of());
        if (links.isEmpty()) {
            return Math.max(0, finish - end);
        }
        int slack = Integer.MAX_VALUE;
        for (Link link : links) {
            int successorStart = earlyStart.get(link.successor());
            int successorFinish =
                    successorStart + activities.get(link.successor()).duration();
            int room = switch (link.type()) {
                case FS -> successorStart - link.lag() - end;
                case SS -> successorStart - link.lag() - start;
                case FF -> successorFinish - link.lag() - end;
                case SF -> successorFinish - link.lag() - start;
            };
            slack = Math.min(slack, room);
        }
        return Math.max(0, slack);
    }
}
