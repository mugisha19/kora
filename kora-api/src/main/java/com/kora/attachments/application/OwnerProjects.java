package com.kora.attachments.application;

import com.kora.attachments.domain.Attachment.Owner;
import com.kora.attachments.domain.AttachmentOwnerType;
import com.kora.governance.GovernanceQueries;
import com.kora.platform.error.NotFoundException;
import com.kora.work.WorkQueries;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** Finds the project an attachment's owner belongs to; an owner that doesn't exist (here) is {@code 404}. */
@Component
class OwnerProjects {

    private final WorkQueries work;
    private final GovernanceQueries governance;

    OwnerProjects(WorkQueries work, GovernanceQueries governance) {
        this.work = work;
        this.governance = governance;
    }

    Owner resolve(AttachmentOwnerType type, UUID ownerId) {
        Optional<UUID> project = switch (type) {
            case PROJECT -> Optional.of(ownerId);
            case TASK ->
                Optional.ofNullable(work.tasks(List.of(ownerId)).get(ownerId)).map(WorkQueries.TaskRef::projectId);
            case RISK -> governance.projectOf(GovernanceQueries.Item.RISK, ownerId);
            case ISSUE -> governance.projectOf(GovernanceQueries.Item.ISSUE, ownerId);
            case CHANGE_REQUEST -> governance.projectOf(GovernanceQueries.Item.CHANGE_REQUEST, ownerId);
        };
        return new Owner(
                type,
                ownerId,
                project.orElseThrow(() -> NotFoundException.of(
                        type.name().toLowerCase(Locale.ROOT).replace('_', '-'), ownerId)));
    }
}
