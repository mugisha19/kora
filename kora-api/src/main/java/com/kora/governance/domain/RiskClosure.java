package com.kora.governance.domain;

/** Why a risk was closed: it can no longer happen, or it happened and became an issue. */
public enum RiskClosure {
    EXPIRED,
    MATERIALIZED
}
