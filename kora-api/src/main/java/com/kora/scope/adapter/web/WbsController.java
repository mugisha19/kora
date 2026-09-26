package com.kora.scope.adapter.web;

import com.kora.organization.MemberDirectory;
import com.kora.organization.MemberSummary;
import com.kora.platform.web.EntityTags;
import com.kora.platform.web.IfMatchVersion;
import com.kora.platform.web.MoneyJson;
import com.kora.platform.web.UserRefJson;
import com.kora.scope.application.WbsService;
import com.kora.scope.application.WbsService.NewNode;
import com.kora.scope.application.WbsService.NodeChanges;
import com.kora.scope.domain.WbsComponent;
import com.kora.scope.domain.WbsNodeType;
import com.kora.scope.domain.WbsTree;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code WBS} (feature 07). */
@RestController
class WbsController {

    private final WbsService wbs;
    private final MemberDirectory members;

    WbsController(WbsService wbs, MemberDirectory members) {
        this.wbs = wbs;
        this.members = members;
    }

    record WbsNodeResponse(
            UUID id,
            UUID parentId,
            String code,
            String name,
            String description,
            WbsNodeType type,
            UserRefJson owner,
            BigDecimal plannedEffortHours,
            MoneyJson plannedCost,
            BigDecimal percentComplete,
            MoneyJson earnedValue,
            long version,
            List<WbsNodeResponse> children) {}

    record WbsTreeResponse(
            UUID projectId,
            BigDecimal plannedEffortHours,
            MoneyJson plannedCost,
            BigDecimal percentComplete,
            MoneyJson earnedValue,
            List<WbsNodeResponse> nodes) {}

    record CreateWbsNodeRequest(
            UUID parentId,
            @NotBlank @Size(max = 200) String name,
            @Size(max = 4000) String description,
            @NotNull WbsNodeType type,
            UUID ownerId,
            @DecimalMin("0") @DecimalMax("1000000") BigDecimal plannedEffortHours,
            @Pattern(regexp = "[0-9]{1,15}(\\.[0-9]{1,4})?") String plannedCost,
            @DecimalMin("0") @DecimalMax("100") BigDecimal percentComplete,
            @Min(0) Integer position) {}

    record UpdateWbsNodeRequest(
            @Size(min = 1, max = 200) String name,
            @Size(max = 4000) String description,
            WbsNodeType type,
            UUID ownerId,
            @DecimalMin("0") @DecimalMax("1000000") BigDecimal plannedEffortHours,
            @Pattern(regexp = "[0-9]{1,15}(\\.[0-9]{1,4})?") String plannedCost,
            @DecimalMin("0") @DecimalMax("100") BigDecimal percentComplete) {}

    record MoveWbsNodeRequest(
            UUID newParentId, @NotNull @Min(0) Integer position) {}

    @GetMapping("/api/v1/projects/{projectId}/wbs")
    WbsTreeResponse tree(@PathVariable("projectId") UUID projectId) {
        return treeResponse(projectId, wbs.tree(projectId));
    }

    @PostMapping("/api/v1/projects/{projectId}/wbs/nodes")
    ResponseEntity<WbsNodeResponse> create(
            @PathVariable("projectId") UUID projectId, @Valid @RequestBody CreateWbsNodeRequest body) {
        WbsTree.Entry entry = wbs.create(
                projectId,
                new NewNode(
                        body.parentId(),
                        body.name(),
                        body.description(),
                        body.type(),
                        body.ownerId(),
                        body.plannedEffortHours(),
                        body.plannedCost(),
                        body.percentComplete(),
                        body.position()));
        return ResponseEntity.created(
                        URI.create("/api/v1/wbs/nodes/" + entry.node().getId()))
                .eTag(EntityTags.of(entry.node().getVersion()))
                .body(nodeResponse(entry, owners(List.of(entry))));
    }

    @PatchMapping("/api/v1/wbs/nodes/{nodeId}")
    ResponseEntity<WbsNodeResponse> update(
            @PathVariable("nodeId") UUID nodeId,
            @IfMatchVersion long expectedVersion,
            @Valid @RequestBody UpdateWbsNodeRequest body) {
        WbsTree.Entry entry = wbs.update(
                nodeId,
                expectedVersion,
                new NodeChanges(
                        body.name(),
                        body.description(),
                        body.type(),
                        body.ownerId(),
                        body.plannedEffortHours(),
                        body.plannedCost(),
                        body.percentComplete()));
        return ResponseEntity.ok()
                .eTag(EntityTags.of(entry.node().getVersion()))
                .body(nodeResponse(entry, owners(List.of(entry))));
    }

    @DeleteMapping("/api/v1/wbs/nodes/{nodeId}")
    ResponseEntity<Void> delete(
            @PathVariable("nodeId") UUID nodeId,
            @RequestParam(name = "cascade", defaultValue = "false") boolean cascade) {
        wbs.delete(nodeId, cascade);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/v1/wbs/nodes/{nodeId}/move")
    WbsTreeResponse move(@PathVariable("nodeId") UUID nodeId, @Valid @RequestBody MoveWbsNodeRequest body) {
        WbsTree tree = wbs.move(nodeId, body.newParentId(), body.position());
        UUID projectId = tree.entry(nodeId).node().getProjectId();
        return treeResponse(projectId, tree);
    }

    private WbsTreeResponse treeResponse(UUID projectId, WbsTree tree) {
        WbsComponent totals = tree.totals();
        List<WbsTree.Entry> roots = tree.roots();
        Map<UUID, MemberSummary> owners = owners(roots);
        return new WbsTreeResponse(
                projectId,
                totals.plannedEffortHours(),
                MoneyJson.from(totals.plannedCost()),
                totals.percentComplete(),
                MoneyJson.from(totals.earnedValue()),
                roots.stream().map(entry -> nodeResponse(entry, owners)).toList());
    }

    private static WbsNodeResponse nodeResponse(WbsTree.Entry entry, Map<UUID, MemberSummary> owners) {
        WbsComponent figures = entry.figures();
        UUID ownerId = entry.node().getOwnerId();
        MemberSummary owner = ownerId == null ? null : owners.get(ownerId);
        return new WbsNodeResponse(
                entry.node().getId(),
                entry.node().getParentId(),
                entry.code(),
                entry.node().getName(),
                entry.node().getDescription(),
                entry.node().getType(),
                owner == null ? null : new UserRefJson(ownerId, owner.fullName()),
                figures.plannedEffortHours(),
                MoneyJson.from(figures.plannedCost()),
                figures.percentComplete(),
                MoneyJson.from(figures.earnedValue()),
                entry.node().getVersion(),
                entry.children().stream()
                        .map(child -> nodeResponse(child, owners))
                        .toList());
    }

    /** Every owner in the tree, named in one lookup. */
    private Map<UUID, MemberSummary> owners(List<WbsTree.Entry> entries) {
        List<UUID> ids = new ArrayList<>();
        collectOwners(entries, ids);
        return members.findAll(ids);
    }

    private static void collectOwners(List<WbsTree.Entry> entries, List<UUID> ids) {
        for (WbsTree.Entry entry : entries) {
            if (entry.node().getOwnerId() != null) {
                ids.add(entry.node().getOwnerId());
            }
            collectOwners(entry.children(), ids);
        }
    }
}
