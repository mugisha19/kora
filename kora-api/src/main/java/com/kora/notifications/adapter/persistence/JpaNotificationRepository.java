package com.kora.notifications.adapter.persistence;

import com.kora.notifications.application.NotificationRepository;
import com.kora.notifications.domain.Notification;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

interface JpaNotificationRepository
        extends Repository<Notification, UUID>, JpaSpecificationExecutor<Notification>, NotificationRepository {

    @Override
    default List<Notification> page(
            UUID userId, boolean unreadOnly, Instant beforeCreatedAt, UUID beforeId, int limit) {
        Specification<Notification> mine = (notification, query, cb) -> cb.equal(notification.get("userId"), userId);
        if (unreadOnly) {
            mine = mine.and((notification, query, cb) -> cb.isNull(notification.get("readAt")));
        }
        if (beforeCreatedAt != null) {
            mine = mine.and((notification, query, cb) -> cb.or(
                    cb.lessThan(notification.get("createdAt"), beforeCreatedAt),
                    cb.and(
                            cb.equal(notification.get("createdAt"), beforeCreatedAt),
                            cb.lessThan(notification.get("id"), beforeId))));
        }
        // Cursor pages need the rows, never a total count.
        return findBy(
                mine,
                query -> query.sortBy(Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")))
                        .limit(limit)
                        .all());
    }

    @Override
    @Modifying
    @Query("update Notification n set n.readAt = :now where n.userId = :userId and n.readAt is null")
    int markAllRead(@Param("userId") UUID userId, @Param("now") Instant now);
}
