package com.kora.governance.application;

import com.kora.governance.domain.Engagement;
import com.kora.governance.domain.Stakeholder;
import com.kora.governance.domain.StakeholderQuadrant;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.OptimisticLock;
import com.kora.portfolio.ProjectAccess;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The stakeholder register (feature 13): the project's managers maintain it, its team reads it. Removing a
 * stakeholder erases their personal data instead of deleting the row.
 */
@Service
public class StakeholderService {

    private final StakeholderRepository stakeholders;
    private final ProjectAccess projects;
    private final GovernanceSupport support;

    StakeholderService(StakeholderRepository stakeholders, ProjectAccess projects, GovernanceSupport support) {
        this.stakeholders = stakeholders;
        this.projects = projects;
        this.support = support;
    }

    public record StakeholderDetails(
            String name,
            String organization,
            String role,
            String email,
            String phone,
            UUID userId,
            Integer power,
            Integer interest,
            Integer influence,
            Engagement currentEngagement,
            Engagement desiredEngagement,
            String communicationPreferences,
            String notes) {}

    /** Registers are small (tens of people), and quadrant and gap are derived, so they are filtered in memory. */
    @Transactional(readOnly = true)
    public Page<Stakeholder> list(UUID projectId, StakeholderQuadrant quadrant, boolean gap, Pageable pageable) {
        projects.readable(projectId);
        List<Stakeholder> matching = stakeholders.findByProjectIdAndRemovedFalseOrderByNameAsc(projectId).stream()
                .filter(stakeholder -> quadrant == null || stakeholder.quadrant() == quadrant)
                .filter(stakeholder -> !gap || stakeholder.engagementGap() > 0)
                .toList();
        Pageable page = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
        int from = (int) Math.min(page.getOffset(), matching.size());
        int to = Math.min(from + page.getPageSize(), matching.size());
        return new PageImpl<>(matching.subList(from, to), page, matching.size());
    }

    /** Every quadrant, in the grid's reading order, even when empty. */
    @Transactional(readOnly = true)
    public Map<StakeholderQuadrant, List<Stakeholder>> grid(UUID projectId) {
        projects.readable(projectId);
        Map<StakeholderQuadrant, List<Stakeholder>> grid = new EnumMap<>(StakeholderQuadrant.class);
        for (StakeholderQuadrant quadrant : StakeholderQuadrant.values()) {
            grid.put(quadrant, List.of());
        }
        grid.putAll(stakeholders.findByProjectIdAndRemovedFalseOrderByNameAsc(projectId).stream()
                .collect(Collectors.groupingBy(Stakeholder::quadrant)));
        return grid;
    }

    @Transactional(readOnly = true)
    public Stakeholder get(UUID stakeholderId) {
        return find(stakeholderId);
    }

    @Transactional
    public Stakeholder create(UUID projectId, StakeholderDetails details) {
        projects.manageable(projectId);
        support.requireMember(details.userId(), "userId");
        Stakeholder stakeholder = Stakeholder.identify(
                support.organizationId(),
                projectId,
                details.name(),
                details.power(),
                details.interest(),
                details.currentEngagement(),
                details.desiredEngagement());
        apply(stakeholder, details);
        return stakeholders.saveAndFlush(stakeholder);
    }

    @Transactional
    public Stakeholder update(UUID stakeholderId, long expectedVersion, StakeholderDetails changes) {
        Stakeholder stakeholder = find(stakeholderId);
        projects.manageable(stakeholder.getProjectId());
        OptimisticLock.check(expectedVersion, stakeholder.getVersion());
        if (stakeholder.isRemoved()) {
            throw NotFoundException.of("Stakeholder", stakeholderId);
        }
        support.requireMember(changes.userId(), "userId");
        if (changes.name() != null) {
            stakeholder.rename(changes.name());
        }
        apply(stakeholder, changes);
        return stakeholders.saveAndFlush(stakeholder);
    }

    @Transactional
    public void remove(UUID stakeholderId) {
        Stakeholder stakeholder = find(stakeholderId);
        projects.manageable(stakeholder.getProjectId());
        stakeholder.remove();
        stakeholders.save(stakeholder);
    }

    private static void apply(Stakeholder stakeholder, StakeholderDetails details) {
        stakeholder.describe(details.organization(), details.role());
        stakeholder.contact(details.email(), details.phone(), details.userId());
        stakeholder.rate(details.power(), details.interest(), details.influence());
        stakeholder.engage(details.currentEngagement(), details.desiredEngagement());
        stakeholder.note(details.communicationPreferences(), details.notes());
    }

    private Stakeholder find(UUID stakeholderId) {
        Stakeholder stakeholder = stakeholders
                .findById(stakeholderId)
                .orElseThrow(() -> NotFoundException.of("Stakeholder", stakeholderId));
        projects.readable(stakeholder.getProjectId());
        return stakeholder;
    }
}
