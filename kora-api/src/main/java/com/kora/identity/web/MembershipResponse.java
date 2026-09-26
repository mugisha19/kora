package com.kora.identity.web;

import com.kora.identity.MembershipView;
import java.util.UUID;

/** Contract schema {@code Membership}. */
public record MembershipResponse(UUID organizationId, String organizationName, String organizationSlug, String role) {

    static MembershipResponse from(MembershipView view) {
        return new MembershipResponse(
                view.organizationId(), view.organizationName(), view.organizationSlug(), view.role());
    }
}
