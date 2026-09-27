package com.kora.resourcing;

import java.util.UUID;

/** Hours on the project were approved: its actual cost (and so its CPI) changed. */
public record ActualCostRecorded(UUID projectId) {}
