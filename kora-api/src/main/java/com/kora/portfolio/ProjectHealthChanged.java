package com.kora.portfolio;

import java.util.UUID;

/** The effective (shown) health changed, computed or overridden; notifications react to it from Phase 8. */
public record ProjectHealthChanged(UUID projectId, Health from, Health to, String reason) {}
