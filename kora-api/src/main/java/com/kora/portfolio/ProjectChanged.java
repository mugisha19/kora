package com.kora.portfolio;

import java.util.UUID;

/**
 * Something about a project changed: its data, status, team, health override or charter. Published inside the
 * changing transaction; read models (the dashboard) listen synchronously so they are never behind what was committed.
 */
public record ProjectChanged(UUID projectId) {}
