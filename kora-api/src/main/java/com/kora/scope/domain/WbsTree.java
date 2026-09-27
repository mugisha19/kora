package com.kora.scope.domain;

import com.kora.platform.error.ConflictException;
import com.kora.platform.error.NotFoundException;
import com.kora.scope.ScopeErrorCodes;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * A project's whole WBS, assembled in memory from its rows (one query, no N+1). It derives the outline codes, rolls up
 * figures through {@link WbsComponent}, and checks every structural rule before a change is saved: a parent is a
 * deliverable, the tree is at most {@value #MAX_DEPTH} levels deep, and nothing moves under its own descendant. Work
 * packages with tasks report the progress measured from their tasks (feature 08).
 */
public final class WbsTree {

    public static final int MAX_DEPTH = 8;

    private final String currency;
    private final Map<UUID, BigDecimal> taskProgress;
    private final Map<UUID, WbsNode> nodes = new HashMap<>();
    private final Map<UUID, List<WbsNode>> childrenByParent = new HashMap<>();

    private WbsTree(List<WbsNode> rows, String currency, Map<UUID, BigDecimal> taskProgress) {
        this.currency = currency;
        this.taskProgress = Map.copyOf(taskProgress);
        rows.forEach(node -> nodes.put(node.getId(), node));
        rows.forEach(node -> childrenByParent
                .computeIfAbsent(node.getParentId(), parent -> new ArrayList<>())
                .add(node));
        childrenByParent.values().forEach(list -> list.sort(Comparator.comparingInt(WbsNode::getPosition)));
    }

    public static WbsTree of(List<WbsNode> rows, String currency) {
        return of(rows, currency, Map.of());
    }

    /**
     * @param taskProgress percent complete measured from tasks, for the work packages that have tasks; it replaces
     *     their reported value
     */
    public static WbsTree of(List<WbsNode> rows, String currency, Map<UUID, BigDecimal> taskProgress) {
        return new WbsTree(rows, currency, taskProgress);
    }

    /** A node with its derived code, depth (1 for top level), children and rolled-up figures. */
    public record Entry(
            WbsNode node,
            String code,
            int depth,
            List<Entry> children,
            WbsComponent figures,
            PercentCompleteSource percentCompleteSource) {}

    public List<Entry> roots() {
        return entries(null, "", 1);
    }

    /** The whole project as one composite. */
    public WbsComponent totals() {
        return new WbsComponent.Deliverable(roots().stream().map(Entry::figures).toList(), currency);
    }

    public Entry entry(UUID nodeId) {
        return find(roots(), nodeId).orElseThrow(() -> NotFoundException.of("WBS node", nodeId));
    }

    /** A work package with tasks: its progress is measured, not reported, and it must stay a work package. */
    public boolean hasTasks(UUID nodeId) {
        return taskProgress.containsKey(nodeId);
    }

    public boolean hasChildren(UUID nodeId) {
        return !children(nodeId).isEmpty();
    }

    public List<WbsNode> children(UUID parentId) {
        return childrenByParent.getOrDefault(parentId, List.of());
    }

    /** The node and everything under it, for cascading deletes. */
    public List<WbsNode> subtree(UUID nodeId) {
        List<WbsNode> all = new ArrayList<>();
        all.add(node(nodeId));
        children(nodeId).forEach(child -> all.addAll(subtree(child.getId())));
        return all;
    }

    // ---- Structural rules ------------------------------------------------------------------------------------------

    /** Checks that a new node may go under {@code parentId} (null for the top level). */
    public void checkCanAddUnder(UUID parentId) {
        if (parentId == null) {
            return;
        }
        requireDeliverable(parentId);
        if (depth(parentId) + 1 > MAX_DEPTH) {
            throw tooDeep();
        }
    }

    /** Checks that {@code nodeId} and its subtree may move under {@code newParentId} (null for the top level). */
    public void checkCanMove(UUID nodeId, UUID newParentId) {
        node(nodeId);
        if (newParentId == null) {
            return;
        }
        if (newParentId.equals(nodeId) || isDescendant(newParentId, nodeId)) {
            throw new ConflictException(
                    ScopeErrorCodes.CYCLE, "A node can't move under itself or one of its own descendants");
        }
        requireDeliverable(newParentId);
        if (depth(newParentId) + height(nodeId) > MAX_DEPTH) {
            throw tooDeep();
        }
    }

    public void checkCanChangeType(UUID nodeId, WbsNodeType newType) {
        if (newType == WbsNodeType.WORK_PACKAGE && hasChildren(nodeId)) {
            throw new ConflictException(
                    ScopeErrorCodes.TYPE_CHANGE_NOT_ALLOWED,
                    "Only a deliverable can have children; move or delete them first");
        }
        if (newType == WbsNodeType.DELIVERABLE && hasTasks(nodeId)) {
            throw new ConflictException(
                    ScopeErrorCodes.TYPE_CHANGE_NOT_ALLOWED,
                    "Tasks are planned under this work package; move them to another one first");
        }
    }

    // ---- Changes (positions are kept 0..n-1 among siblings) --------------------------------------------------------

    /** Inserts a new node among its siblings at {@code position} (clamped; appended when null). */
    public int insertionPosition(UUID parentId, Integer position) {
        int size = children(parentId).size();
        int at = position == null ? size : Math.min(Math.max(position, 0), size);
        List<WbsNode> siblings = children(parentId);
        for (int i = at; i < siblings.size(); i++) {
            siblings.get(i).reposition(i + 1);
        }
        return at;
    }

    public void changeType(WbsNode node, WbsNodeType newType) {
        checkCanChangeType(node.getId(), newType);
        node.changeType(newType);
    }

    /** Moves the node, closing the gap it leaves and opening one where it lands. */
    public void move(UUID nodeId, UUID newParentId, int position) {
        checkCanMove(nodeId, newParentId);
        WbsNode node = node(nodeId);
        List<WbsNode> oldSiblings = new ArrayList<>(children(node.getParentId()));
        oldSiblings.remove(node);
        renumber(oldSiblings);
        List<WbsNode> newSiblings = new ArrayList<>(children(newParentId));
        newSiblings.remove(node);
        int at = Math.min(Math.max(position, 0), newSiblings.size());
        newSiblings.add(at, node);
        node.placeUnder(newParentId, at);
        renumber(newSiblings);
    }

    /** Closes the gap a deleted node leaves among its siblings. */
    public void closeGapAfterRemoving(WbsNode removed) {
        List<WbsNode> siblings = new ArrayList<>(children(removed.getParentId()));
        siblings.remove(removed);
        renumber(siblings);
    }

    // ---- Internals ------------------------------------------------------------------------------------------------

    private List<Entry> entries(UUID parentId, String prefix, int depth) {
        List<Entry> result = new ArrayList<>();
        List<WbsNode> siblings = children(parentId);
        for (int i = 0; i < siblings.size(); i++) {
            WbsNode node = siblings.get(i);
            String code = prefix + (i + 1);
            List<Entry> children = entries(node.getId(), code + ".", depth + 1);
            result.add(new Entry(node, code, depth, children, figures(node, children), source(node)));
        }
        return result;
    }

    private WbsComponent figures(WbsNode node, List<Entry> children) {
        if (node.getType() == WbsNodeType.WORK_PACKAGE) {
            return new WbsComponent.WorkPackage(
                    node.getPlannedEffortHours(),
                    node.getPlannedCost(),
                    taskProgress.getOrDefault(node.getId(), node.getPercentComplete()));
        }
        return new WbsComponent.Deliverable(
                children.stream().map(Entry::figures).toList(), currency);
    }

    private PercentCompleteSource source(WbsNode node) {
        if (node.getType() == WbsNodeType.DELIVERABLE) {
            return PercentCompleteSource.ROLLED_UP;
        }
        return hasTasks(node.getId()) ? PercentCompleteSource.TASKS : PercentCompleteSource.REPORTED;
    }

    private static Optional<Entry> find(List<Entry> entries, UUID nodeId) {
        for (Entry entry : entries) {
            if (entry.node().getId().equals(nodeId)) {
                return Optional.of(entry);
            }
            Optional<Entry> below = find(entry.children(), nodeId);
            if (below.isPresent()) {
                return below;
            }
        }
        return Optional.empty();
    }

    private WbsNode node(UUID nodeId) {
        WbsNode node = nodes.get(nodeId);
        if (node == null) {
            throw NotFoundException.of("WBS node", nodeId);
        }
        return node;
    }

    private void requireDeliverable(UUID nodeId) {
        if (node(nodeId).getType() != WbsNodeType.DELIVERABLE) {
            throw new ConflictException(
                    ScopeErrorCodes.PARENT_NOT_DELIVERABLE,
                    "Only a deliverable can have children; work packages are the leaves of the WBS");
        }
    }

    private int depth(UUID nodeId) {
        int depth = 1;
        for (UUID parent = node(nodeId).getParentId();
                parent != null;
                parent = node(parent).getParentId()) {
            depth++;
        }
        return depth;
    }

    /** Levels in the subtree rooted at the node (1 for a leaf). */
    private int height(UUID nodeId) {
        return 1
                + children(nodeId).stream()
                        .mapToInt(child -> height(child.getId()))
                        .max()
                        .orElse(0);
    }

    private boolean isDescendant(UUID candidate, UUID ancestor) {
        for (UUID parent = node(candidate).getParentId();
                parent != null;
                parent = node(parent).getParentId()) {
            if (parent.equals(ancestor)) {
                return true;
            }
        }
        return false;
    }

    private static void renumber(List<WbsNode> siblings) {
        for (int i = 0; i < siblings.size(); i++) {
            siblings.get(i).reposition(i);
        }
    }

    private static ConflictException tooDeep() {
        return new ConflictException(ScopeErrorCodes.TOO_DEEP, "The WBS is limited to " + MAX_DEPTH + " levels");
    }
}
