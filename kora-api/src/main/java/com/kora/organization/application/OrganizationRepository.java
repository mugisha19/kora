package com.kora.organization.application;

import com.kora.organization.domain.Organization;
import java.util.Optional;
import java.util.UUID;

/** Persistence port for organizations; row-level security limits it to the organization in scope. */
public interface OrganizationRepository {

    Optional<Organization> findById(UUID id);

    /**
     * Loads the organization with a row lock held until the transaction ends. Serializes role changes within one
     * organization, so two admins demoting each other at the same moment can't leave it without an admin.
     */
    Optional<Organization> lockById(UUID id);

    boolean existsBySlug(String slug);

    Organization save(Organization organization);

    Organization saveAndFlush(Organization organization);
}
