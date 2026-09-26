package com.kora.identity.application;

import com.kora.identity.MeView;
import com.kora.identity.MembershipDirectory;
import com.kora.identity.UserLocale;
import com.kora.identity.UserProfileChanged;
import com.kora.identity.domain.User;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.error.UnauthenticatedException;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The user's own profile: {@code GET /me} and {@code PATCH /me} (features 02 and 23). */
@Service
public class ProfileService {

    private final UserRepository users;
    private final MembershipDirectory memberships;
    private final ApplicationEventPublisher events;

    ProfileService(UserRepository users, MembershipDirectory memberships, ApplicationEventPublisher events) {
        this.users = users;
        this.memberships = memberships;
        this.events = events;
    }

    /**
     * Not transactional on purpose: the membership lookup runs in its own cross-organization transaction, and
     * nesting it inside one here would hold two connections for no benefit.
     */
    public MeView me(UUID userId) {
        User user = users.findById(userId).filter(User::isEnabled).orElseThrow(ProfileService::accountGone);
        return new MeView(
                user.getId(), user.getEmail(), user.getFullName(), user.getLocale(), memberships.membershipsOf(userId));
    }

    /** Changes only the fields given (null means "leave as is"). */
    @Transactional
    public void update(UUID userId, String fullName, UserLocale locale) {
        User user = users.findById(userId).filter(User::isEnabled).orElseThrow(ProfileService::accountGone);
        if (fullName != null) {
            user.rename(fullName);
        }
        if (locale != null) {
            user.changeLocale(locale);
        }
        if (fullName != null) {
            events.publishEvent(new UserProfileChanged(user.getId(), user.getEmail(), user.getFullName()));
        }
    }

    /** A valid token for an account that no longer exists (or was disabled) is treated as signed out. */
    private static UnauthenticatedException accountGone() {
        return new UnauthenticatedException(PlatformErrorCodes.UNAUTHENTICATED, "Sign in to continue");
    }
}
