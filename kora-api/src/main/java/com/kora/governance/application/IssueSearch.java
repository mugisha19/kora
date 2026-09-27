package com.kora.governance.application;

import com.kora.governance.domain.IssuePriority;
import com.kora.governance.domain.IssueStatus;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Issue filters; null means "any".
 *
 * @param overdueAsOf only unresolved issues due before this day; null for no such filter
 */
public record IssueSearch(
        UUID projectId, IssueStatus status, IssuePriority priority, UUID ownerId, LocalDate overdueAsOf, String q) {}
