package com.kora.governance.application;

import com.kora.governance.domain.GovernanceSequence;
import com.kora.organization.CurrentMember;
import com.kora.organization.MemberDirectory;
import com.kora.organization.OrganizationTimeZone;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.portfolio.ProjectAccess;
import com.kora.portfolio.ProjectRef;
import java.time.Clock;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** What the governance use cases share: keys, the "manager or owner" rule, people checks and the organization's day. */
@Component
class GovernanceSupport {

    private final GovernanceSequenceRepository sequences;
    private final ProjectAccess projects;
    private final MemberDirectory members;
    private final OrganizationTimeZone timeZone;
    private final Clock clock;

    GovernanceSupport(
            GovernanceSequenceRepository sequences,
            ProjectAccess projects,
            MemberDirectory members,
            OrganizationTimeZone timeZone,
            Clock clock) {
        this.sequences = sequences;
        this.projects = projects;
        this.members = members;
        this.timeZone = timeZone;
        this.clock = clock;
    }

    record Numbered(int number, String key) {}

    /** The next key of the kind in the project, e.g. {@code AKG-12-R3}; the counter stays locked until commit. */
    Numbered next(ProjectRef project, GovernanceSequence.Kind kind) {
        sequences.createIfAbsent(project.id(), kind.name(), organizationId());
        int number = sequences.lock(project.id(), kind.name()).next();
        return new Numbered(number, GovernanceSequence.key(project.code(), kind, number));
    }

    /**
     * The owner of a risk or issue works on it; otherwise only the project's managers may change it. Either way the
     * project must be visible, so a stranger still gets 404.
     */
    void requireManagerOrOwner(UUID projectId, UUID ownerId) {
        projects.readable(projectId);
        if (ownerId == null || !ownerId.equals(me())) {
            projects.manageable(projectId);
        }
    }

    void requireMember(UUID userId, String field) {
        if (userId != null && members.find(userId).isEmpty()) {
            throw new InvalidInputException(
                    FieldViolation.of(field, PlatformErrorCodes.Field.INVALID, "is not a member of this organization"));
        }
    }

    LocalDate today() {
        return LocalDate.now(clock.withZone(timeZone.zone()));
    }

    UUID me() {
        return CurrentMember.get().userId();
    }

    UUID organizationId() {
        return CurrentMember.get().organizationId();
    }
}
