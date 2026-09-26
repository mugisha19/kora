package com.kora.portfolio;

import java.util.UUID;

/** A charter version was approved, authorizing the project (feature 06). */
public record CharterApproved(UUID projectId, int versionNumber, UUID approvedBy) {}
