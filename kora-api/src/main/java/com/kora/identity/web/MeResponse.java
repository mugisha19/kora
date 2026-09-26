package com.kora.identity.web;

import com.kora.identity.MeView;
import java.util.List;
import java.util.UUID;

/** Contract schema {@code MeResponse}. */
public record MeResponse(UUID id, String email, String fullName, String locale, List<MembershipResponse> memberships) {

    public static MeResponse from(MeView view) {
        return new MeResponse(
                view.id(),
                view.email(),
                view.fullName(),
                view.locale().code(),
                view.memberships().stream().map(MembershipResponse::from).toList());
    }
}
