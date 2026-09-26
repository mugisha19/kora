package com.kora.organization;

import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Looks up people in the active organization (tenant-scoped, like every organization query). */
public interface MemberDirectory {

    Optional<MemberSummary> find(UUID userId);

    /** One query for many people, e.g. every manager on a page of projects. Unknown ids are simply absent. */
    Map<UUID, MemberSummary> findAll(Collection<UUID> userIds);
}
