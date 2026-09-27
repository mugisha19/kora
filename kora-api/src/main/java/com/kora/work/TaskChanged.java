package com.kora.work;

import java.util.UUID;

/**
 * Something about a project's tasks changed (created, edited, moved, deleted, planned into or out of a sprint); the
 * WBS progress, the dashboard and the sprint burndown may differ. Published inside the changing transaction.
 */
public record TaskChanged(UUID projectId) {}
