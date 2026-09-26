/**
 * Reporting (feature 05, later 21): read models only, no business rules of its own except the documented health
 * rule. It listens to other modules' events and keeps a denormalized snapshot per project (CQRS-lite).
 */
@ApplicationModule(displayName = "Reporting")
package com.kora.reporting;

import org.springframework.modulith.ApplicationModule;
