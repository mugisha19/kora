package com.kora.governance.domain;

/** Bands of a risk score (probability × impact, 1–25), feature 11: 1–4 low, 5–9 medium, 10–14 high, 15–25 critical. */
public enum Severity {
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL;

    public static final int CRITICAL_FROM = 15;

    public static Severity of(int score) {
        if (score >= CRITICAL_FROM) {
            return CRITICAL;
        }
        if (score >= 10) {
            return HIGH;
        }
        return score >= 5 ? MEDIUM : LOW;
    }
}
