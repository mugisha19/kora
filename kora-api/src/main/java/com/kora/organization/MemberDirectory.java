package com.kora.organization;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Looks up people in the active organization (tenant-scoped, like every organization query). */
public interface MemberDirectory {

    Optional<MemberSummary> find(UUID userId);

    /** One query for many people, e.g. every manager on a page of projects. Unknown ids are simply absent. */
    Map<UUID, MemberSummary> findAll(Collection<UUID> userIds);

    /** Everyone in the organization, by name (capacity planning looks at the whole workforce). */
    List<MemberSummary> everyone();
}
