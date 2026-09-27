package com.kora.work.application;

import java.util.UUID;

/** A sprint's task count and story points, summed by the database. */
public record SprintTotals(UUID sprintId, long taskCount, long points) {}
