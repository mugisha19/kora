package com.kora.governance.adapter.persistence;

import com.kora.governance.application.IssueRepository;
import com.kora.governance.application.IssueSearch;
import com.kora.governance.domain.Issue;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.repository.Repository;

interface JpaIssueRepository extends Repository<Issue, UUID>, JpaSpecificationExecutor<Issue>, IssueRepository {

    @Override
    default Page<Issue> search(IssueSearch search, Pageable pageable) {
        return findAll(GovernanceSpecifications.issues(search), pageable);
    }
}
