package com.kora.governance.domain;

/** Stakeholder engagement levels (PMBOK), declared from least to most engaged, so the gap is a difference of ordinals. */
public enum Engagement {
    UNAWARE,
    RESISTANT,
    NEUTRAL,
    SUPPORTIVE,
    LEADING;

    /** Positive when {@code desired} is more engaged than this. */
    public int gapTo(Engagement desired) {
        return desired.ordinal() - ordinal();
    }
}
