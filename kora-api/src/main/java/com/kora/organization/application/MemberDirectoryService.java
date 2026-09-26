package com.kora.organization.application;

import com.kora.organization.MemberDirectory;
import com.kora.organization.MemberSummary;
import com.kora.organization.domain.Membership;
import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class MemberDirectoryService implements MemberDirectory {

    private final MembershipRepository memberships;

    MemberDirectoryService(MembershipRepository memberships) {
        this.memberships = memberships;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<MemberSummary> find(UUID userId) {
        return memberships.findByUserId(userId).map(MemberDirectoryService::summary);
    }

    @Override
    @Transactional(readOnly = true)
    public Map<UUID, MemberSummary> findAll(Collection<UUID> userIds) {
        if (userIds.isEmpty()) {
            return Map.of();
        }
        return memberships.findByUserIdIn(userIds).stream()
                .map(MemberDirectoryService::summary)
                .collect(Collectors.toMap(MemberSummary::userId, Function.identity()));
    }

    private static MemberSummary summary(Membership membership) {
        return new MemberSummary(
                membership.getUserId(), membership.getMemberName(), membership.getMemberEmail(), membership.getRole());
    }
}
