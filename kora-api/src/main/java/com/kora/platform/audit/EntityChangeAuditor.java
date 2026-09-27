package com.kora.platform.audit;

import com.kora.platform.audit.AuditRecord.FieldChange;
import com.kora.platform.audit.AuditRecord.Outcome;
import com.kora.platform.tenancy.TenantScope;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.sql.SQLException;
import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.hibernate.engine.spi.SessionImplementor;
import org.hibernate.engine.spi.SharedSessionContractImplementor;
import org.hibernate.engine.spi.TransactionCompletionCallbacks;
import org.hibernate.event.spi.PostDeleteEvent;
import org.hibernate.event.spi.PostDeleteEventListener;
import org.hibernate.event.spi.PostInsertEvent;
import org.hibernate.event.spi.PostInsertEventListener;
import org.hibernate.event.spi.PostUpdateEvent;
import org.hibernate.event.spi.PostUpdateEventListener;
import org.hibernate.persister.entity.EntityPersister;
import org.springframework.context.ApplicationEventPublisher;

/**
 * Records every change to an audited entity (feature 19), generically: every mutating endpoint is covered without
 * each use case remembering to log. Changes collect per session and are written, hash-chained, just before the
 * transaction commits, after Hibernate's final flush, so the trail commits or rolls back with the change it
 * describes. Committed entries are then published for the live activity feed.
 */
final class EntityChangeAuditor implements PostInsertEventListener, PostUpdateEventListener, PostDeleteEventListener {

    /** Never recorded: optimistic-lock counters and anything that holds or protects a secret. */
    private static final Set<String> IGNORED = Set.of("version");

    private static final int TEXT_MAX = 500;

    private final ApplicationEventPublisher events;
    private final Clock clock;
    private final Map<SharedSessionContractImplementor, List<AuditRecord>> pending = new ConcurrentHashMap<>();
    private final Map<Class<?>, EntityShape> shapes = new ConcurrentHashMap<>();

    EntityChangeAuditor(ApplicationEventPublisher events, Clock clock) {
        this.events = events;
        this.clock = clock;
    }

    @Override
    public void onPostInsert(PostInsertEvent event) {
        record(
                event.getSession(),
                event.getEntity(),
                event.getId(),
                "created",
                event.getPersister(),
                null,
                event.getState(),
                null);
    }

    @Override
    public void onPostUpdate(PostUpdateEvent event) {
        record(
                event.getSession(),
                event.getEntity(),
                event.getId(),
                "updated",
                event.getPersister(),
                event.getOldState(),
                event.getState(),
                event.getDirtyProperties());
    }

    @Override
    public void onPostDelete(PostDeleteEvent event) {
        record(event.getSession(), event.getEntity(), event.getId(), "deleted", event.getPersister(), null, null, null);
    }

    @Override
    public boolean requiresPostCommitHandling(EntityPersister persister) {
        return false;
    }

    private void record(
            SharedSessionContractImplementor session,
            Object entity,
            Object id,
            String verb,
            EntityPersister persister,
            Object[] before,
            Object[] after,
            int[] dirty) {
        EntityShape shape = shapes.computeIfAbsent(entity.getClass(), EntityShape::of);
        if (!shape.audited()) {
            return;
        }
        Map<String, FieldChange> changes = changes(shape, persister.getPropertyNames(), before, after, dirty);
        if ("updated".equals(verb) && changes.isEmpty()) {
            return;
        }
        AuditContext.Origin origin = AuditContext.current();
        AuditRecord record = new AuditRecord(
                shape.organizationId(entity)
                        .orElseGet(() -> TenantScope.organizationId().orElse(null)),
                clock.instant().truncatedTo(ChronoUnit.MICROS),
                origin.actorId(),
                origin.actorIp(),
                origin.userAgent(),
                origin.correlationId(),
                shape.type() + "." + verb,
                shape.type(),
                id instanceof UUID uuid ? uuid : null,
                shape.label(entity),
                shape.projectId(entity, id),
                Outcome.SUCCESS,
                changes);
        List<AuditRecord> batch = pending.computeIfAbsent(session, key -> {
            register(key);
            return new ArrayList<>();
        });
        synchronized (batch) {
            batch.add(record);
        }
    }

    private void register(SharedSessionContractImplementor session) {
        if (!(session instanceof SessionImplementor full)) {
            return;
        }
        full.getActionQueue().registerCallback((TransactionCompletionCallbacks.BeforeCompletionCallback) this::write);
        full.getActionQueue().registerCallback((TransactionCompletionCallbacks.AfterCompletionCallback)
                (success, completed) -> pending.remove(completed));
    }

    /** Runs after the final flush: the batch is complete, and the transaction is still open. */
    private void write(SharedSessionContractImplementor session) {
        List<AuditRecord> batch = pending.remove(session);
        if (batch == null || batch.isEmpty()) {
            return;
        }
        List<AuditRecord> records;
        synchronized (batch) {
            records = List.copyOf(batch);
        }
        List<StoredAuditEvent> stored = append(session, records);
        if (!stored.isEmpty() && session instanceof SessionImplementor full) {
            full.getActionQueue().registerCallback((TransactionCompletionCallbacks.AfterCompletionCallback)
                    (success, completed) -> {
                        if (success) {
                            events.publishEvent(new AuditEventsRecorded(stored));
                        }
                    });
        }
    }

    private static List<StoredAuditEvent> append(SharedSessionContractImplementor session, List<AuditRecord> records) {
        try {
            return AuditChain.append(
                    session.getJdbcCoordinator().getLogicalConnection().getPhysicalConnection(), records);
        } catch (SQLException failure) {
            // An audit trail that can't be written must stop the change it would have recorded.
            throw new IllegalStateException("Could not write the audit trail", failure);
        }
    }

    private Map<String, FieldChange> changes(
            EntityShape shape, String[] names, Object[] before, Object[] after, int[] dirty) {
        Map<String, FieldChange> changes = new TreeMap<>();
        if (after == null) {
            return changes;
        }
        int[] indexes = dirty != null ? dirty : allIndexes(names.length);
        for (int index : indexes) {
            String name = names[index];
            if (IGNORED.contains(name) || shape.excluded(name)) {
                continue;
            }
            Object oldValue = before == null ? null : before[index];
            Object newValue = after[index];
            if (oldValue instanceof Collection<?>
                    || newValue instanceof Collection<?>
                    || newValue instanceof Map<?, ?>) {
                continue;
            }
            if (before == null && newValue == null) {
                continue;
            }
            if (isSecret(name)) {
                changes.put(name, new FieldChange(null, null));
                continue;
            }
            changes.put(name, new FieldChange(value(oldValue), value(newValue)));
        }
        return changes;
    }

    private static boolean isSecret(String property) {
        String name = property.toLowerCase(Locale.ROOT);
        return name.contains("password") || name.contains("secret") || name.contains("token") || name.endsWith("hash");
    }

    private static Object value(Object value) {
        if (value == null || value instanceof Number || value instanceof Boolean) {
            return value;
        }
        String text = value instanceof Enum<?> constant ? constant.name() : value.toString();
        return text.length() <= TEXT_MAX ? text : text.substring(0, TEXT_MAX) + "…";
    }

    private static int[] allIndexes(int count) {
        int[] indexes = new int[count];
        for (int i = 0; i < count; i++) {
            indexes[i] = i;
        }
        return indexes;
    }

    /** What the auditor needs to know about an entity class, found once by reflection. */
    private record EntityShape(
            boolean audited,
            String type,
            Set<String> excludedFields,
            Field organizationField,
            Field projectField,
            List<Method> labelGetters,
            boolean isProject) {

        static EntityShape of(Class<?> type) {
            boolean audited = type.getName().startsWith("com.kora.") && !type.isAnnotationPresent(NotAudited.class);
            Set<String> excluded = new HashSet<>();
            for (Field field : type.getDeclaredFields()) {
                if (field.isAnnotationPresent(NotAudited.class)) {
                    excluded.add(field.getName());
                }
            }
            List<Method> labels = new ArrayList<>();
            for (String getter : List.of("getKey", "getCode", "getName", "getTitle")) {
                try {
                    Method method = type.getMethod(getter);
                    if (method.getReturnType() == String.class) {
                        labels.add(method);
                    }
                } catch (NoSuchMethodException absent) {
                    // not every entity has every kind of label
                }
            }
            return new EntityShape(
                    audited,
                    kebab(type.getSimpleName()),
                    Set.copyOf(excluded),
                    field(type, "organizationId"),
                    field(type, "projectId"),
                    List.copyOf(labels),
                    type.getSimpleName().equals("Project"));
        }

        boolean excluded(String property) {
            return excludedFields.contains(property);
        }

        Optional<UUID> organizationId(Object entity) {
            return Optional.ofNullable((UUID) read(organizationField, entity));
        }

        UUID projectId(Object entity, Object id) {
            if (isProject && id instanceof UUID uuid) {
                return uuid;
            }
            return (UUID) read(projectField, entity);
        }

        String label(Object entity) {
            for (Method getter : labelGetters) {
                try {
                    Object label = getter.invoke(entity);
                    if (label instanceof String text && !text.isBlank()) {
                        return text.length() <= 200 ? text : text.substring(0, 200);
                    }
                } catch (ReflectiveOperationException unreadable) {
                    // fall through to the next kind of label
                }
            }
            return null;
        }

        private static Object read(Field field, Object entity) {
            if (field == null) {
                return null;
            }
            try {
                return field.get(entity);
            } catch (IllegalAccessException unreadable) {
                return null;
            }
        }

        private static Field field(Class<?> type, String name) {
            try {
                Field field = type.getDeclaredField(name);
                if (field.getType() != UUID.class) {
                    return null;
                }
                field.setAccessible(true);
                return field;
            } catch (NoSuchFieldException absent) {
                return null;
            }
        }

        /** {@code ChangeRequest} → {@code change-request}: the entity type in actions and history URLs. */
        static String kebab(String name) {
            return name.replaceAll("([a-z0-9])([A-Z])", "$1-$2").toLowerCase(Locale.ROOT);
        }
    }
}
