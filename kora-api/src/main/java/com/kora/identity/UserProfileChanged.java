package com.kora.identity;

import java.util.UUID;

/** Published after a user changes their name or email, so modules holding a copy (member lists) can update it. */
public record UserProfileChanged(UUID userId, String email, String fullName) {}
