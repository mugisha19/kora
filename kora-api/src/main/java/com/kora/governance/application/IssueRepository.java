package com.kora.governance.application;

import com.kora.governance.domain.Issue;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/** Persistence port for issues (tenant-filtered). */
public interface IssueRepository {

    Optional<Issue> findById(UUID id);

    Page<Issue> search(IssueSearch search, Pageable pageable);

    Issue save(Issue issue);

    Issue saveAndFlush(Issue issue);
}
