package com.kora.work.adapter.persistence;

import com.kora.work.application.TaskSearch;
import com.kora.work.domain.Task;
import com.kora.work.domain.TaskStatus;
import java.util.Locale;
import org.springframework.data.jpa.domain.Specification;

/**
 * Task list filters as composable Specifications. The tenant condition is absent on purpose: {@code @TenantId} adds
 * it to every query.
 */
final class TaskSpecifications {

    private TaskSpecifications() {}

    static Specification<Task> tasks(TaskSearch search) {
        Specification<Task> all = (task, query, cb) -> cb.equal(task.get("projectId"), search.projectId());
        if (search.backlog()) {
            all = all.and((task, query, cb) ->
                    cb.and(cb.isNull(task.get("sprintId")), cb.notEqual(task.get("status"), TaskStatus.DONE)));
        }
        if (search.status() != null) {
            all = all.and((task, query, cb) -> cb.equal(task.get("status"), search.status()));
        }
        if (search.assigneeId() != null) {
            all = all.and((task, query, cb) -> cb.equal(task.get("assigneeId"), search.assigneeId()));
        }
        if (search.sprintId() != null) {
            all = all.and((task, query, cb) -> cb.equal(task.get("sprintId"), search.sprintId()));
        }
        if (search.type() != null) {
            all = all.and((task, query, cb) -> cb.equal(task.get("type"), search.type()));
        }
        if (hasText(search.label())) {
            // Labels are stored as a JSON array of strings and may not contain quotes, so "label" in quotes matches
            // exactly that label.
            String pattern = "%\"" + escape(search.label().strip()) + "\"%";
            all = all.and((task, query, cb) -> cb.like(task.get("labelsJson"), pattern, '\\'));
        }
        if (hasText(search.q())) {
            String pattern = "%" + escape(search.q().strip().toLowerCase(Locale.ROOT)) + "%";
            all = all.and((task, query, cb) -> cb.or(
                    cb.like(cb.lower(task.get("title")), pattern, '\\'),
                    cb.like(cb.lower(task.get("key")), pattern, '\\')));
        }
        return all;
    }

    private static boolean hasText(String text) {
        return text != null && !text.isBlank();
    }

    /** The user's {@code %} and {@code _} are matched literally. */
    private static String escape(String text) {
        return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
