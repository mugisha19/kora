package com.kora.scope;

import java.util.UUID;

/** The WBS of a project changed (a node added, edited, moved or deleted); its totals may differ. */
public record WbsChanged(UUID projectId) {}
