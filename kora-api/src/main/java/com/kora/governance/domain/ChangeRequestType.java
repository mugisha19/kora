package com.kora.governance.domain;

/** Which baseline a change request mostly touches. */
public enum ChangeRequestType {
    SCOPE,
    SCHEDULE,
    COST,
    QUALITY,
    OTHER
}
