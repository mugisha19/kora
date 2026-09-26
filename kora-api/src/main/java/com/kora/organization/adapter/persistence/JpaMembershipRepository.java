package com.kora.organization.adapter.persistence;

import com.kora.organization.application.MemberSearch;
import com.kora.organization.application.MembershipRepository;
import com.kora.organization.application.MembershipSummary;
import com.kora.organization.domain.Membership;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

interface JpaMembershipRepository
        extends Repository<Membership, UUID>, JpaSpecificationExecutor<Membership>, MembershipRepository {

    @Override
    default Page<Membership> search(MemberSearch search, Pageable pageable) {
        return findAll(MemberSpecifications.matching(search), pageable);
    }

    @Override
    @Query("""
            select new com.kora.organization.application.MembershipSummary(m.organizationId, o.name, o.slug, m.role)
            from Membership m join Organization o on o.id = m.organizationId
            where m.userId = :userId
            order by o.name
            """)
    List<MembershipSummary> summariesOfUser(@Param("userId") UUID userId);

    @Override
    @Modifying
    @Query("update Membership m set m.memberEmail = :email, m.memberName = :name where m.userId = :userId")
    int updateProfile(
            @Param("userId") UUID userId, @Param("email") String memberEmail, @Param("name") String memberName);
}
