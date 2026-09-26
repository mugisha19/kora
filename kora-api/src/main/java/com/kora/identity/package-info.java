/**
 * Identity: people, passwords, access tokens and refresh sessions, password recovery and the user's own profile
 * (features 01 and 23).
 *
 * <p>Users are global, not tenant-owned: one account can belong to several organizations. This package is the
 * module's public API; {@code web} is a named interface other modules use to answer with a session.
 */
@ApplicationModule(displayName = "Identity")
package com.kora.identity;

import org.springframework.modulith.ApplicationModule;
