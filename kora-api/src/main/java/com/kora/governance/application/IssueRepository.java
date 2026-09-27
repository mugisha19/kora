package com.kora.governance.application;

import com.kora.governance.domain.Issue;
import com.kora.governance.domain.IssuePriority;
import com.kora.governance.domain.IssueStatus;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/** Persistence port for issues (tenant-filtered). */
public interface IssueRepository {

    Optional<Issue> findById(UUID id);

    Page<Issue> search(IssueSearch search, Pageable pageable);

    List<Issue> findByPriorityAndStatusIn(IssuePriority priority, Collection<IssueStatus> statuses);

    Issue save(Issue issue);

    Issue saveAndFlush(Issue issue);
}
