package com.kora.governance.domain;

/**
 * Where a risk is in its management (feature 11): {@code IDENTIFIED → ANALYZED → RESPONSE_PLANNED → MONITORING}, then
 * {@code CLOSED}. The open states may be set in any order, since risk work loops back (a re-assessment can mean a new
 * plan), but the planned ones need a response.
 */
public enum RiskStatus {
    IDENTIFIED,
    ANALYZED,
    RESPONSE_PLANNED,
    MONITORING,
    CLOSED;

    public boolean needsResponse() {
        return this == RESPONSE_PLANNED || this == MONITORING;
    }
}
