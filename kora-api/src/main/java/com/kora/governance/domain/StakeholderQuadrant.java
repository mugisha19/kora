package com.kora.governance.domain;

/**
 * The power/interest grid (feature 13). On the 1–5 scales, 3 or more counts as high, so a stakeholder only needs to
 * matter moderately to be managed rather than monitored.
 */
public enum StakeholderQuadrant {
    MANAGE_CLOSELY,
    KEEP_SATISFIED,
    KEEP_INFORMED,
    MONITOR;

    public static final int HIGH_FROM = 3;

    public static StakeholderQuadrant of(int power, int interest) {
        boolean highPower = power >= HIGH_FROM;
        boolean highInterest = interest >= HIGH_FROM;
        if (highPower) {
            return highInterest ? MANAGE_CLOSELY : KEEP_SATISFIED;
        }
        return highInterest ? KEEP_INFORMED : MONITOR;
    }
}
