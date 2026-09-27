package com.kora.work.application;

import com.kora.work.domain.TaskStatus;

/** How many of a project's tasks are in one status (the board's WIP counts). */
public record StatusCount(TaskStatus status, long tasks) {}
