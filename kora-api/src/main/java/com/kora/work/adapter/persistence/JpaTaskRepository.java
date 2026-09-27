package com.kora.work.adapter.persistence;

import com.kora.work.application.SprintTotals;
import com.kora.work.application.StatusCount;
import com.kora.work.application.TaskRepository;
import com.kora.work.application.TaskSearch;
import com.kora.work.domain.Task;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

interface JpaTaskRepository extends Repository<Task, UUID>, JpaSpecificationExecutor<Task>, TaskRepository {

    @Override
    default Page<Task> search(TaskSearch search, Pageable pageable) {
        return findAll(TaskSpecifications.tasks(search), pageable);
    }

    @Override
    default List<Task> search(TaskSearch search, Sort sort) {
        return findAll(TaskSpecifications.tasks(search), sort);
    }

    @Override
    @Query("""
            select new com.kora.work.application.StatusCount(t.status, count(t))
            from Task t where t.projectId = :projectId group by t.status
            """)
    List<StatusCount> countByStatus(@Param("projectId") UUID projectId);

    @Override
    @Query("""
            select new com.kora.work.application.SprintTotals(t.sprintId, count(t), coalesce(sum(t.storyPoints), 0))
            from Task t where t.projectId = :projectId and t.sprintId is not null group by t.sprintId
            """)
    List<SprintTotals> sprintTotals(@Param("projectId") UUID projectId);
}
