package com.kora.identity.adapter.web;

import com.kora.identity.CurrentUser;
import com.kora.identity.UserLocale;
import com.kora.identity.application.ProfileService;
import com.kora.identity.web.MeResponse;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code Me}: the signed-in user's profile and memberships (features 02, 23). */
@RestController
@RequestMapping("/api/v1/me")
class MeController {

    private final ProfileService profiles;

    MeController(ProfileService profiles) {
        this.profiles = profiles;
    }

    @GetMapping
    MeResponse me() {
        return MeResponse.from(profiles.me(CurrentUser.id()));
    }

    @PatchMapping
    MeResponse update(@Valid @RequestBody UpdateMeRequest body) {
        if (body.fullName() == null && body.locale() == null) {
            throw new InvalidInputException(
                    FieldViolation.of("body", PlatformErrorCodes.Field.REQUIRED, "Send fullName, locale or both"));
        }
        UUID userId = CurrentUser.id();
        profiles.update(
                userId,
                body.fullName(),
                body.locale() == null
                        ? null
                        : UserLocale.fromCode(body.locale()).orElseThrow());
        return MeResponse.from(profiles.me(userId));
    }

    /** Contract schema {@code UpdateMeRequest}: absent fields stay unchanged. */
    record UpdateMeRequest(
            @Size(min = 1, max = 120) @Pattern(regexp = ".*\\S.*", message = "must not be blank") String fullName,

            @Pattern(regexp = "en|fr|rw") String locale) {}
}
