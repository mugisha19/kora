/**
 * Telling people what needs them (feature 18): notifications built from domain events delivered through the
 * transactional outbox, email per preference, and live delivery over a STOMP WebSocket.
 */
@ApplicationModule(displayName = "Notifications")
package com.kora.notifications;

import org.springframework.modulith.ApplicationModule;
