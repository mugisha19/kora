package com.kora.portfolio;

/**
 * The caller's part in a project they may work on: a manager (the project manager, {@code PMO}, {@code ORG_ADMIN})
 * may do anything with its work; a contributor only with work that is theirs or nobody's yet.
 */
public record ProjectParticipation(ProjectRef project, boolean manages) {}
