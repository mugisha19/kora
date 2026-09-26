package com.kora.identity;

import java.util.List;
import java.util.UUID;

/** The signed-in user with all their memberships: what {@code GET /me} returns and every session includes. */
public record MeView(UUID id, String email, String fullName, UserLocale locale, List<MembershipView> memberships) {

    public MeView {
        memberships = List.copyOf(memberships);
    }
}
