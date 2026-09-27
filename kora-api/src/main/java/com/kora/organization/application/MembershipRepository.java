package com.kora.organization.application;

import com.kora.organization.Role;
import com.kora.organization.domain.Membership;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/**
 * Persistence port for memberships. Queries are tenant-filtered automatically ({@code @TenantId} and row-level
 * security), so "count the admins" means the admins of the organization in scope, with no organization parameter
 * that a caller could forget or get wrong.
 */
public interface MembershipRepository {

    Optional<Membership> findById(UUID id);

    Optional<Membership> findByUserId(UUID userId);

    List<Membership> findByUserIdIn(Collection<UUID> userIds);

    List<Membership> findAllByOrderByMemberNameAsc();

    boolean existsByUserId(UUID userId);

    /** @param memberEmail already normalized */
    boolean existsByMemberEmail(String memberEmail);

    long countByRole(Role role);

    Page<Membership> search(MemberSearch search, Pageable pageable);

    /** Across organizations: call in the system scope. */
    List<MembershipSummary> summariesOfUser(UUID userId);

    /** Across organizations: call in the system scope. Returns the number of memberships updated. */
    int updateProfile(UUID userId, String memberEmail, String memberName);

    Membership save(Membership membership);

    Membership saveAndFlush(Membership membership);

    void delete(Membership membership);
}
