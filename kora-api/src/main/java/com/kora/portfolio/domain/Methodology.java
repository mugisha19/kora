package com.kora.portfolio.domain;

/**
 * How the project is delivered. It decides which tools apply: Agile projects get a board and a backlog, Predictive
 * ones a schedule with a critical path, Hybrid ones both (the web app shows tabs accordingly).
 */
public enum Methodology {
    AGILE,
    PREDICTIVE,
    HYBRID
}
