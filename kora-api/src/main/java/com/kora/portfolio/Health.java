package com.kora.portfolio;

/**
 * RAG health of a project. {@code GREY} means not started or finished: there is nothing to judge. The rule that
 * computes it lives in the reporting module (ADR 0008); a manager may override it with a reason.
 */
public enum Health {
    GREEN,
    AMBER,
    RED,
    GREY
}
