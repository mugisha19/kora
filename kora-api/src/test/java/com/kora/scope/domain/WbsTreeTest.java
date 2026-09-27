package com.kora.scope.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kora.platform.error.ConflictException;
import com.kora.platform.money.Money;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Feature 07: codes, Composite roll-ups and the structural rules of the WBS. */
class WbsTreeTest {

    private static final UUID ORG = UUID.randomUUID();
    private static final UUID PROJECT = UUID.randomUUID();

    private final List<WbsNode> rows = new ArrayList<>();

    private WbsNode add(UUID parentId, WbsNodeType type, String name) {
        int position = (int) rows.stream()
                .filter(row -> Objects.equals(row.getParentId(), parentId))
                .count();
        WbsNode node = WbsNode.create(ORG, PROJECT, parentId, position, name, null, type, null, "RWF", Instant.now());
        rows.add(node);
        return node;
    }

    private WbsNode workPackage(UUID parentId, String name, int effort, String cost, int percent) {
        WbsNode node = add(parentId, WbsNodeType.WORK_PACKAGE, name);
        node.plan(BigDecimal.valueOf(effort), Money.of(cost, "RWF"), BigDecimal.valueOf(percent));
        return node;
    }

    private WbsTree tree() {
        return WbsTree.of(rows, "RWF");
    }

    @Test
    void derivesOutlineCodesFromPositions() {
        WbsNode design = add(null, WbsNodeType.DELIVERABLE, "Design");
        add(design.getId(), WbsNodeType.WORK_PACKAGE, "Wireframes");
        add(design.getId(), WbsNodeType.WORK_PACKAGE, "Visual design");
        add(null, WbsNodeType.DELIVERABLE, "Build");

        List<WbsTree.Entry> roots = tree().roots();

        assertThat(roots).extracting(WbsTree.Entry::code).containsExactly("1", "2");
        assertThat(roots.getFirst().children()).extracting(WbsTree.Entry::code).containsExactly("1.1", "1.2");
    }

    @Test
    void rollsProgressUpWeightedByEffortAndEarnedValueExactly() {
        WbsNode design = add(null, WbsNodeType.DELIVERABLE, "Design");
        workPackage(design.getId(), "Small", 100, "1000000", 50);
        workPackage(design.getId(), "Large", 300, "3000000", 10);

        WbsComponent figures = tree().roots().getFirst().figures();

        assertThat(figures.plannedEffortHours()).isEqualByComparingTo("400");
        assertThat(figures.plannedCost()).isEqualTo(Money.of("4000000", "RWF"));
        // (50 × 100 + 10 × 300) / 400 = 20, not the plain average of 30
        assertThat(figures.percentComplete()).isEqualByComparingTo("20.00");
        assertThat(figures.earnedValue()).isEqualTo(Money.of("800000", "RWF"));
    }

    @Test
    void progressMeasuredFromTasksReplacesTheReportedValue() {
        WbsNode design = add(null, WbsNodeType.DELIVERABLE, "Design");
        WbsNode measured = workPackage(design.getId(), "Measured", 100, "0", 10);
        WbsNode reported = workPackage(design.getId(), "Reported", 100, "0", 40);

        WbsTree tree = WbsTree.of(rows, "RWF", Map.of(measured.getId(), new BigDecimal("80.00")));
        WbsTree.Entry root = tree.roots().getFirst();

        assertThat(root.figures().percentComplete()).isEqualByComparingTo("60.00");
        assertThat(root.percentCompleteSource()).isEqualTo(PercentCompleteSource.ROLLED_UP);
        assertThat(root.children())
                .extracting(WbsTree.Entry::percentCompleteSource)
                .containsExactly(PercentCompleteSource.TASKS, PercentCompleteSource.REPORTED);
        assertThat(tree.hasTasks(reported.getId())).isFalse();
    }

    @Test
    void aWorkPackageWithTasksStaysAWorkPackage() {
        WbsNode measured = workPackage(null, "Measured", 10, "0", 0);
        WbsTree tree = WbsTree.of(rows, "RWF", Map.of(measured.getId(), BigDecimal.ZERO));

        assertThatThrownBy(() -> tree.checkCanChangeType(measured.getId(), WbsNodeType.DELIVERABLE))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void withoutPlannedEffortEveryChildWeighsTheSame() {
        WbsNode deliverable = add(null, WbsNodeType.DELIVERABLE, "Docs");
        workPackage(deliverable.getId(), "A", 0, "0", 100);
        workPackage(deliverable.getId(), "B", 0, "0", 0);

        assertThat(tree().roots().getFirst().figures().percentComplete()).isEqualByComparingTo("50.00");
    }

    @Test
    void rollsUpThroughEveryLevelToTheProjectTotal() {
        WbsNode app = add(null, WbsNodeType.DELIVERABLE, "App");
        WbsNode backend = add(app.getId(), WbsNodeType.DELIVERABLE, "Backend");
        workPackage(backend.getId(), "API", 200, "2000000", 100);
        workPackage(app.getId(), "UI", 200, "1000000", 0);
        workPackage(null, "Launch", 100, "500000", 0);

        WbsComponent total = tree().totals();

        assertThat(total.plannedEffortHours()).isEqualByComparingTo("500");
        assertThat(total.plannedCost()).isEqualTo(Money.of("3500000", "RWF"));
        assertThat(total.percentComplete()).isEqualByComparingTo("40.00");
        assertThat(total.earnedValue()).isEqualTo(Money.of("2000000", "RWF"));
    }

    @Test
    void onlyDeliverablesHaveChildren() {
        WbsNode leaf = add(null, WbsNodeType.WORK_PACKAGE, "Leaf");

        assertThatThrownBy(() -> tree().checkCanAddUnder(leaf.getId()))
                .isInstanceOf(ConflictException.class)
                .extracting("code")
                .isEqualTo("wbs.parent_not_deliverable");
    }

    @Test
    void refusesANinthLevel() {
        UUID parent = null;
        for (int level = 1; level <= WbsTree.MAX_DEPTH; level++) {
            parent = add(parent, WbsNodeType.DELIVERABLE, "Level " + level).getId();
        }
        UUID deepest = parent;

        assertThatThrownBy(() -> tree().checkCanAddUnder(deepest))
                .isInstanceOf(ConflictException.class)
                .extracting("code")
                .isEqualTo("wbs.too_deep");
    }

    @Test
    void refusesToMoveANodeUnderItsOwnDescendant() {
        WbsNode top = add(null, WbsNodeType.DELIVERABLE, "Top");
        WbsNode middle = add(top.getId(), WbsNodeType.DELIVERABLE, "Middle");
        WbsNode bottom = add(middle.getId(), WbsNodeType.DELIVERABLE, "Bottom");

        assertThatThrownBy(() -> tree().checkCanMove(top.getId(), bottom.getId()))
                .isInstanceOf(ConflictException.class)
                .extracting("code")
                .isEqualTo("wbs.cycle");
        assertThatThrownBy(() -> tree().checkCanMove(top.getId(), top.getId())).isInstanceOf(ConflictException.class);
    }

    @Test
    void movingRenumbersBothOldAndNewSiblings() {
        WbsNode first = add(null, WbsNodeType.DELIVERABLE, "First");
        WbsNode second = add(null, WbsNodeType.DELIVERABLE, "Second");
        WbsNode a = add(first.getId(), WbsNodeType.WORK_PACKAGE, "A");
        WbsNode b = add(first.getId(), WbsNodeType.WORK_PACKAGE, "B");

        tree().move(a.getId(), second.getId(), 0);

        WbsTree after = tree();
        assertThat(after.entry(b.getId()).code()).isEqualTo("1.1");
        assertThat(after.entry(a.getId()).code()).isEqualTo("2.1");
    }

    @Test
    void aDeliverableWithChildrenCantBecomeAWorkPackage() {
        WbsNode deliverable = add(null, WbsNodeType.DELIVERABLE, "D");
        add(deliverable.getId(), WbsNodeType.WORK_PACKAGE, "child");

        assertThatThrownBy(() -> tree().changeType(deliverable, WbsNodeType.WORK_PACKAGE))
                .isInstanceOf(ConflictException.class)
                .extracting("code")
                .isEqualTo("wbs.type_change_not_allowed");
    }
}
