package com.kora.governance;

import java.util.UUID;

/** A change request of the project was submitted, decided or withdrawn; the dashboard's pending count may differ. */
public record ChangeRequestChanged(UUID projectId) {}
