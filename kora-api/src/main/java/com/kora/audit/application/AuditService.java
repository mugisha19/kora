package com.kora.audit.application;

import com.kora.audit.domain.AuditEntry;
import com.kora.organization.CurrentMember;
import com.kora.organization.Role;
import com.kora.platform.audit.AuditRecord;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.portfolio.ProjectAccess;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reading the audit trail (feature 19) and the project activity feed (feature 18). The log and its verification are
 * for administrators; an item's history and a project's feed for everyone who can see the project.
 */
@Service
public class AuditService {

    private final AuditEntryRepository entries;
    private final ProjectAccess projects;

    AuditService(AuditEntryRepository entries, ProjectAccess projects) {
        this.entries = entries;
        this.projects = projects;
    }

    /** One page, newest first; {@code nextCursor} is null on the last page. */
    public record Page(List<AuditEntry> items, String nextCursor) {}

    /**
     * @param firstBrokenId the first entry whose hash or link doesn't match, or null
     */
    public record Verification(boolean valid, int checked, UUID firstBrokenId) {}

    @Transactional(readOnly = true)
    public Page log(
            UUID actorId,
            String entityType,
            UUID entityId,
            String action,
            LocalDate from,
            LocalDate to,
            String cursor,
            int limit) {
        CurrentMember.requireRole(Role.ORG_ADMIN);
        return page(
                new AuditSearch(
                        actorId, entityType, entityId, action, null, null, start(from), end(to), position(cursor)),
                limit);
    }

    @Transactional(readOnly = true)
    public Page activity(UUID projectId, String cursor, int limit) {
        projects.readable(projectId);
        return page(
                new AuditSearch(
                        null, null, null, null, projectId, AuditRecord.Outcome.SUCCESS, null, null, position(cursor)),
                limit);
    }

    /**
     * An item's field-level history. Its project decides who may see it; items outside projects (organization,
     * portfolios, members) are for administrators and the PMO.
     */
    @Transactional(readOnly = true)
    public List<AuditEntry> history(String entityType, UUID entityId) {
        List<AuditEntry> history = entries.findByEntityTypeAndEntityIdOrderByChainPositionAsc(entityType, entityId);
        if (history.isEmpty()) {
            throw NotFoundException.of(entityType, entityId);
        }
        Optional<UUID> project = history.stream()
                .map(AuditEntry::getProjectId)
                .filter(Objects::nonNull)
                .findFirst();
        if (project.isPresent()) {
            projects.readable(project.get());
        } else {
            CurrentMember.requireRole(Role.ORG_ADMIN, Role.PMO);
        }
        return history;
    }

    /** Recomputes every hash in the period and checks each entry links to the one before it. */
    @Transactional(readOnly = true)
    public Verification verify(LocalDate from, LocalDate to) {
        CurrentMember.requireRole(Role.ORG_ADMIN);
        List<AuditEntry> chain = entries.chain(start(from), end(to));
        if (chain.isEmpty()) {
            return new Verification(true, 0, null);
        }
        String expectedPrevious = entries.findFirstByChainPositionLessThanOrderByChainPositionDesc(
                        chain.getFirst().getChainPosition())
                .map(AuditEntry::getHash)
                .orElse(null);
        int checked = 0;
        for (AuditEntry entry : chain) {
            checked++;
            if (!entry.isIntact(expectedPrevious)) {
                return new Verification(false, checked, entry.getId());
            }
            expectedPrevious = entry.getHash();
        }
        return new Verification(true, checked, null);
    }

    private Page page(AuditSearch search, int limit) {
        List<AuditEntry> found = entries.search(search, limit + 1);
        if (found.size() <= limit) {
            return new Page(found, null);
        }
        List<AuditEntry> items = found.subList(0, limit);
        return new Page(List.copyOf(items), cursorAfter(items.getLast()));
    }

    /** Opaque to clients: the chain position to continue below. */
    private static String cursorAfter(AuditEntry last) {
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(("p:" + last.getChainPosition()).getBytes(StandardCharsets.UTF_8));
    }

    private static Long position(String cursor) {
        if (cursor == null || cursor.isBlank()) {
            return null;
        }
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
            if (decoded.startsWith("p:")) {
                return Long.parseLong(decoded.substring(2));
            }
        } catch (IllegalArgumentException malformed) {
            // reported below
        }
        throw new InvalidInputException(FieldViolation.of(
                "cursor", PlatformErrorCodes.Field.INVALID, "use the nextCursor of the previous page"));
    }

    private static Instant start(LocalDate day) {
        return day == null ? null : day.atStartOfDay().toInstant(ZoneOffset.UTC);
    }

    private static Instant end(LocalDate day) {
        return day == null ? null : day.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC);
    }
}
