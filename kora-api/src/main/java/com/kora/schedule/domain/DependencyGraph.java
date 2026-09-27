package com.kora.schedule.domain;

import com.kora.schedule.domain.SchedulingStrategy.Link;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Tasks as nodes and dependencies as directed edges, for the two graph questions the schedule asks: in which order can
 * the tasks be computed (topological sort), and where is the loop when there is none.
 */
public final class DependencyGraph {

    private final List<UUID> nodes;
    private final Map<UUID, List<UUID>> successors = new HashMap<>();

    public DependencyGraph(Collection<UUID> nodes, Collection<Link> links) {
        this.nodes = List.copyOf(nodes);
        this.nodes.forEach(node -> successors.put(node, new ArrayList<>()));
        links.forEach(link -> successors
                .computeIfAbsent(link.predecessor(), node -> new ArrayList<>())
                .add(link.successor()));
    }

    /**
     * Kahn's algorithm, O(V + E): repeatedly take a node nothing points to any more. Ties keep the input order, so the
     * result is stable.
     *
     * @throws CyclicDependencyException naming one loop when some nodes are never freed
     */
    public List<UUID> topologicalOrder() {
        Map<UUID, Integer> incoming = new LinkedHashMap<>();
        nodes.forEach(node -> incoming.put(node, 0));
        successors.values().forEach(next -> next.forEach(node -> incoming.merge(node, 1, Integer::sum)));
        Deque<UUID> ready = new ArrayDeque<>();
        incoming.forEach((node, count) -> {
            if (count == 0) {
                ready.add(node);
            }
        });
        List<UUID> order = new ArrayList<>(incoming.size());
        while (!ready.isEmpty()) {
            UUID node = ready.poll();
            order.add(node);
            for (UUID next : successors.getOrDefault(node, List.of())) {
                if (incoming.merge(next, -1, Integer::sum) == 0) {
                    ready.add(next);
                }
            }
        }
        if (order.size() < incoming.size()) {
            Set<UUID> stuck = new HashSet<>(incoming.keySet());
            order.forEach(stuck::remove);
            throw new CyclicDependencyException(loopWithin(stuck));
        }
        return order;
    }

    /**
     * The loop a new link {@code predecessor → successor} would close: a path already leading from the successor back
     * to the predecessor, found breadth-first so it is the shortest one.
     *
     * @return {@code [predecessor, successor, ..., predecessor]}, or empty when the link is safe
     */
    public Optional<List<UUID>> loopClosedBy(UUID predecessor, UUID successor) {
        Map<UUID, UUID> cameFrom = new HashMap<>();
        Deque<UUID> queue = new ArrayDeque<>(List.of(successor));
        Set<UUID> seen = new HashSet<>(List.of(successor));
        while (!queue.isEmpty()) {
            UUID node = queue.poll();
            if (node.equals(predecessor)) {
                List<UUID> path = new ArrayList<>();
                for (UUID step = node; step != null; step = cameFrom.get(step)) {
                    path.addFirst(step);
                }
                path.addFirst(predecessor);
                return Optional.of(path);
            }
            for (UUID next : successors.getOrDefault(node, List.of())) {
                if (seen.add(next)) {
                    cameFrom.put(next, node);
                    queue.add(next);
                }
            }
        }
        return Optional.empty();
    }

    /** Walks forward inside the stuck nodes (each still has a stuck predecessor) until a node repeats. */
    private List<UUID> loopWithin(Set<UUID> stuck) {
        Map<UUID, UUID> predecessorInStuck = new HashMap<>();
        successors.forEach((from, next) -> {
            if (stuck.contains(from)) {
                next.stream().filter(stuck::contains).forEach(to -> predecessorInStuck.putIfAbsent(to, from));
            }
        });
        UUID start = nodes.stream().filter(stuck::contains).findFirst().orElseThrow();
        List<UUID> walk = new ArrayList<>();
        Set<UUID> visited = new HashSet<>();
        UUID node = start;
        while (visited.add(node)) {
            walk.add(node);
            node = predecessorInStuck.get(node);
        }
        // Walking backwards found a loop through `node`; cut the lead-in and turn it forwards.
        List<UUID> loop = new ArrayList<>(walk.subList(walk.indexOf(node), walk.size()));
        loop = new ArrayList<>(loop.reversed());
        loop.add(loop.getFirst());
        return loop;
    }
}
