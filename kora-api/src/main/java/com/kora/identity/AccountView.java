package com.kora.identity;

import java.util.UUID;

/** Read-only view of an account for other modules; never exposes the password hash. */
public record AccountView(UUID id, String email, String fullName, UserLocale locale) {}
