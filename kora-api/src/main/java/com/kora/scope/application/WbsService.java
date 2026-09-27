package com.kora.scope.application;

import com.kora.organization.CurrentMember;
import com.kora.organization.MemberDirectory;
import com.kora.organization.OrganizationCurrency;
import com.kora.platform.error.ConflictException;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.OptimisticLock;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.money.Money;
import com.kora.platform.web.MoneyJson;
import com.kora.portfolio.ProjectAccess;
import com.kora.scope.ScopeErrorCodes;
import com.kora.scope.WbsChanged;
import com.kora.scope.domain.WbsNode;
import com.kora.scope.domain.WbsNodeType;
import com.kora.scope.domain.WbsTree;
import java.math.BigDecimal;
import java.time.Clock;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The work breakdown structure (feature 07). Every change loads the project's whole tree, lets {@link WbsTree} check
 * the structural rules, and saves; reads return the tree with codes and rolled-up figures.
 */
@Service
public class WbsService {

    private final WbsNodeRepository nodes;
    private final ProjectAccess projects;
    private final OrganizationCurrency currency;
    private final MemberDirectory members;
    private final TaskProgress taskProgress;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    WbsService(
            WbsNodeRepository nodes,
            ProjectAccess projects,
            OrganizationCurrency currency,
            MemberDirectory members,
            TaskProgress taskProgress,
            ApplicationEventPublisher events,
            Clock clock) {
        this.nodes = nodes;
        this.projects = projects;
        this.currency = currency;
        this.members = members;
        this.taskProgress = taskProgress;
        this.events = events;
        this.clock = clock;
    }

    public record NewNode(
            UUID parentId,
            String name,
            String description,
            WbsNodeType type,
            UUID ownerId,
            BigDecimal plannedEffortHours,
            String plannedCost,
            BigDecimal percentComplete,
            Integer position) {}

    public record NodeChanges(
            String name,
            String description,
            WbsNodeType type,
            UUID ownerId,
            BigDecimal plannedEffortHours,
            String plannedCost,
            BigDecimal percentComplete) {}

    @Transactional(readOnly = true)
    public WbsTree tree(UUID projectId) {
        projects.readable(projectId);
        return load(projectId);
    }

    @Transactional
    public WbsTree.Entry create(UUID projectId, NewNode command) {
        projects.manageable(projectId);
        WbsTree tree = load(projectId);
        if (command.parentId() != null
                && nodes.findById(command.parentId())
                        .filter(parent -> parent.getProjectId().equals(projectId))
                        .isEmpty()) {
            throw new InvalidInputException(
                    FieldViolation.of("parentId", PlatformErrorCodes.Field.INVALID, "no such node in this project"));
        }
        tree.checkCanAddUnder(command.parentId());
        requireOwner(command.ownerId());
        String organizationCurrency = currency.current();
        int position = tree.insertionPosition(command.parentId(), command.position());
        WbsNode node = WbsNode.create(
                CurrentMember.get().organizationId(),
                projectId,
                command.parentId(),
                position,
                command.name(),
                command.description(),
                command.type(),
                command.ownerId(),
                organizationCurrency,
                clock.instant());
        if (hasPlanning(command.plannedEffortHours(), command.plannedCost(), command.percentComplete())) {
            node.plan(
                    command.plannedEffortHours(),
                    cost(command.plannedCost(), organizationCurrency),
                    command.percentComplete());
        }
        nodes.save(node);
        events.publishEvent(new WbsChanged(projectId));
        return load(projectId).entry(node.getId());
    }

    @Transactional
    public WbsTree.Entry update(UUID nodeId, long expectedVersion, NodeChanges changes) {
        WbsNode node = find(nodeId);
        projects.manageable(node.getProjectId());
        OptimisticLock.check(expectedVersion, node.getVersion());
        WbsTree tree = load(node.getProjectId());
        if (changes.type() != null && changes.type() != node.getType()) {
            tree.changeType(node, changes.type());
        }
        if (changes.name() != null) {
            node.rename(changes.name());
        }
        if (changes.description() != null) {
            node.describe(changes.description());
        }
        if (changes.ownerId() != null) {
            requireOwner(changes.ownerId());
            node.assignOwner(changes.ownerId());
        }
        if (changes.percentComplete() != null && tree.hasTasks(nodeId)) {
            throw new InvalidInputException(FieldViolation.of(
                    "percentComplete", PlatformErrorCodes.Field.INVALID, "is measured from this work package's tasks"));
        }
        if (hasPlanning(changes.plannedEffortHours(), changes.plannedCost(), changes.percentComplete())) {
            node.plan(
                    changes.plannedEffortHours(),
                    cost(changes.plannedCost(), node.getPlannedCost().currency()),
                    changes.percentComplete());
        }
        nodes.saveAndFlush(node);
        events.publishEvent(new WbsChanged(node.getProjectId()));
        return load(node.getProjectId()).entry(nodeId);
    }

    /** Deleting a node with children needs {@code cascade}, so a subtree is never lost by accident. */
    @Transactional
    public void delete(UUID nodeId, boolean cascade) {
        WbsNode node = find(nodeId);
        projects.manageable(node.getProjectId());
        WbsTree tree = load(node.getProjectId());
        if (tree.hasChildren(nodeId) && !cascade) {
            throw new ConflictException(
                    ScopeErrorCodes.HAS_CHILDREN, "The node has children; delete with cascade=true to remove them too");
        }
        // Leaves first: the subtree lists parents before children, and deleting a parent first would let the database
        // cascade remove rows Hibernate still expects to delete itself.
        List<WbsNode> subtree = tree.subtree(nodeId).reversed();
        tree.closeGapAfterRemoving(node);
        nodes.deleteAll(subtree);
        events.publishEvent(new WbsChanged(node.getProjectId()));
    }

    @Transactional
    public WbsTree move(UUID nodeId, UUID newParentId, int position) {
        WbsNode node = find(nodeId);
        projects.manageable(node.getProjectId());
        WbsTree tree = load(node.getProjectId());
        if (newParentId != null
                && nodes.findById(newParentId)
                        .filter(parent -> parent.getProjectId().equals(node.getProjectId()))
                        .isEmpty()) {
            throw new InvalidInputException(
                    FieldViolation.of("newParentId", PlatformErrorCodes.Field.INVALID, "no such node in this project"));
        }
        tree.move(nodeId, newParentId, position);
        nodes.saveAndFlush(node);
        events.publishEvent(new WbsChanged(node.getProjectId()));
        return load(node.getProjectId());
    }

    private WbsTree load(UUID projectId) {
        return WbsTree.of(nodes.findByProjectId(projectId), currency.current(), taskProgress.of(projectId));
    }

    /** Nodes are found through their tenant-filtered row, then the project decides whether the caller may see it. */
    private WbsNode find(UUID nodeId) {
        WbsNode node = nodes.findById(nodeId).orElseThrow(() -> NotFoundException.of("WBS node", nodeId));
        projects.readable(node.getProjectId());
        return node;
    }

    private void requireOwner(UUID ownerId) {
        if (ownerId != null && members.find(ownerId).isEmpty()) {
            throw new InvalidInputException(FieldViolation.of(
                    "ownerId", PlatformErrorCodes.Field.INVALID, "is not a member of this organization"));
        }
    }

    private static boolean hasPlanning(BigDecimal effort, String cost, BigDecimal percent) {
        return effort != null || cost != null || percent != null;
    }

    private static Money cost(String amount, String currency) {
        if (amount == null) {
            return null;
        }
        return MoneyJson.parse("plannedCost", amount, currency);
    }
}
