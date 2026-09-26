package com.kora.portfolio.domain;

import java.time.LocalDate;

/** A high-level milestone in the charter; the detailed schedule (feature 10) plans the work towards it. */
public record CharterMilestone(String name, LocalDate targetDate) {}
