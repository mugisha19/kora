package com.kora.portfolio.domain;

/** A person's role on one project. The manager is the project's {@code managerId}, not a stored membership. */
public enum ProjectRole {
    MANAGER,
    CONTRIBUTOR,
    OBSERVER
}
