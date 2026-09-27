package com.kora.governance.adapter.web;

import com.kora.governance.adapter.web.GovernanceDtos.CreateStakeholderRequest;
import com.kora.governance.adapter.web.GovernanceDtos.StakeholderGridEntryResponse;
import com.kora.governance.adapter.web.GovernanceDtos.StakeholderGridQuadrantResponse;
import com.kora.governance.adapter.web.GovernanceDtos.StakeholderGridResponse;
import com.kora.governance.adapter.web.GovernanceDtos.StakeholderResponse;
import com.kora.governance.adapter.web.GovernanceDtos.UpdateStakeholderRequest;
import com.kora.governance.application.StakeholderService;
import com.kora.governance.application.StakeholderService.StakeholderDetails;
import com.kora.governance.domain.Stakeholder;
import com.kora.governance.domain.StakeholderQuadrant;
import com.kora.platform.web.EntityTags;
import com.kora.platform.web.IfMatchVersion;
import com.kora.platform.web.PageResponse;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code Stakeholders} (feature 13). */
@RestController
class StakeholdersController {

    private final StakeholderService stakeholders;

    StakeholdersController(StakeholderService stakeholders) {
        this.stakeholders = stakeholders;
    }

    @GetMapping("/api/v1/projects/{projectId}/stakeholders")
    PageResponse<StakeholderResponse> list(
            @PathVariable("projectId") UUID projectId,
            @RequestParam(name = "quadrant", required = false) StakeholderQuadrant quadrant,
            @RequestParam(name = "gap", defaultValue = "false") boolean gap,
            Pageable pageable) {
        return PageResponse.from(
                stakeholders.list(projectId, quadrant, gap, pageable), GovernanceResponses::stakeholder);
    }

    @GetMapping("/api/v1/projects/{projectId}/stakeholders/grid")
    StakeholderGridResponse grid(@PathVariable("projectId") UUID projectId) {
        return new StakeholderGridResponse(
                projectId,
                stakeholders.grid(projectId).entrySet().stream()
                        .map(quadrant -> new StakeholderGridQuadrantResponse(
                                quadrant.getKey(),
                                quadrant.getValue().stream()
                                        .map(stakeholder -> new StakeholderGridEntryResponse(
                                                stakeholder.getId(),
                                                stakeholder.getName(),
                                                stakeholder.getPower(),
                                                stakeholder.getInterest(),
                                                stakeholder.engagementGap()))
                                        .toList()))
                        .toList());
    }

    @PostMapping("/api/v1/projects/{projectId}/stakeholders")
    ResponseEntity<StakeholderResponse> create(
            @PathVariable("projectId") UUID projectId, @Valid @RequestBody CreateStakeholderRequest body) {
        Stakeholder stakeholder = stakeholders.create(
                projectId,
                new StakeholderDetails(
                        body.name(),
                        body.organization(),
                        body.role(),
                        body.email(),
                        body.phone(),
                        body.userId(),
                        body.power(),
                        body.interest(),
                        body.influence(),
                        body.currentEngagement(),
                        body.desiredEngagement(),
                        body.communicationPreferences(),
                        body.notes()));
        return ResponseEntity.created(URI.create("/api/v1/stakeholders/" + stakeholder.getId()))
                .eTag(EntityTags.of(stakeholder.getVersion()))
                .body(GovernanceResponses.stakeholder(stakeholder));
    }

    @GetMapping("/api/v1/stakeholders/{stakeholderId}")
    ResponseEntity<StakeholderResponse> get(@PathVariable("stakeholderId") UUID stakeholderId) {
        return withTag(stakeholders.get(stakeholderId));
    }

    @PatchMapping("/api/v1/stakeholders/{stakeholderId}")
    ResponseEntity<StakeholderResponse> update(
            @PathVariable("stakeholderId") UUID stakeholderId,
            @IfMatchVersion long expectedVersion,
            @Valid @RequestBody UpdateStakeholderRequest body) {
        return withTag(stakeholders.update(
                stakeholderId,
                expectedVersion,
                new StakeholderDetails(
                        body.name(),
                        body.organization(),
                        body.role(),
                        body.email(),
                        body.phone(),
                        body.userId(),
                        body.power(),
                        body.interest(),
                        body.influence(),
                        body.currentEngagement(),
                        body.desiredEngagement(),
                        body.communicationPreferences(),
                        body.notes())));
    }

    @DeleteMapping("/api/v1/stakeholders/{stakeholderId}")
    ResponseEntity<Void> delete(@PathVariable("stakeholderId") UUID stakeholderId) {
        stakeholders.remove(stakeholderId);
        return ResponseEntity.noContent().build();
    }

    private static ResponseEntity<StakeholderResponse> withTag(Stakeholder stakeholder) {
        return ResponseEntity.ok()
                .eTag(EntityTags.of(stakeholder.getVersion()))
                .body(GovernanceResponses.stakeholder(stakeholder));
    }
}
