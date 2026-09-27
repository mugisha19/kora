package com.kora.work.application;

import com.kora.work.domain.Task;
import com.kora.work.domain.TaskStatus;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

/** Persistence port for tasks (tenant-filtered). */
public interface TaskRepository {

    Optional<Task> findById(UUID id);

    List<Task> findByIdIn(Collection<UUID> ids);

    Page<Task> search(TaskSearch search, Pageable pageable);

    List<Task> search(TaskSearch search, Sort sort);

    List<Task> findByProjectIdAndWbsNodeIdIsNotNull(UUID projectId);

    List<Task> findBySprintId(UUID sprintId);

    /** The task at the bottom of the project's order. */
    Optional<Task> findFirstByProjectIdOrderByRankDesc(UUID projectId);

    /** The task just below {@code rank}, ignoring the task being moved. */
    Optional<Task> findFirstByProjectIdAndRankGreaterThanAndIdNotOrderByRankAsc(UUID projectId, String rank, UUID id);

    /** The task just above {@code rank}, ignoring the task being moved. */
    Optional<Task> findFirstByProjectIdAndRankLessThanAndIdNotOrderByRankDesc(UUID projectId, String rank, UUID id);

    long countByProjectIdAndStatus(UUID projectId, TaskStatus status);

    List<StatusCount> countByStatus(UUID projectId);

    List<SprintTotals> sprintTotals(UUID projectId);

    Task save(Task task);

    Task saveAndFlush(Task task);

    void delete(Task task);
}
