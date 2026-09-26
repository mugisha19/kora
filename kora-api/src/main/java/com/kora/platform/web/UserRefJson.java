package com.kora.platform.web;

import java.util.UUID;

/** Contract schema {@code UserRef}: who someone is, for display next to what they own, manage or approved. */
public record UserRefJson(UUID userId, String fullName) {}
