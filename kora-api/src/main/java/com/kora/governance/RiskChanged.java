package com.kora.governance;

import java.util.UUID;

/** A risk of the project was raised, re-scored, planned or closed; project health may differ. */
public record RiskChanged(UUID projectId) {}
