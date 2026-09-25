package com.kora.platform.web;

import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

/**
 * Which fields a list endpoint may be sorted by, and how API field names map to entity properties.
 *
 * <p>Passing a client's {@code sort} straight to a repository would let anyone sort by any property path
 * (including ones they can't see, which leaks information through ordering) and would couple the contract to the
 * entity model. Unknown fields are rejected with {@code 400 validation.failed} on the {@code sort} field.
 *
 * <pre>{@code
 * static final SortPolicy MEMBERS = SortPolicy.defaultingTo(Sort.by("user.fullName"))
 *         .allow("fullName", "user.fullName")
 *         .allow("joinedAt");
 * Page<Membership> page = repository.findAll(spec, MEMBERS.apply(pageable));
 * }</pre>
 */
public final class SortPolicy {

    private final Sort defaultSort;
    private final Map<String, String> propertiesByField;

    private SortPolicy(Sort defaultSort, Map<String, String> propertiesByField) {
        this.defaultSort = defaultSort;
        this.propertiesByField = propertiesByField;
    }

    public static SortPolicy defaultingTo(Sort defaultSort) {
        return new SortPolicy(defaultSort, Map.of());
    }

    /** Allows sorting by {@code field}, which is also the entity property. */
    public SortPolicy allow(String field) {
        return allow(field, field);
    }

    /** Allows sorting by the API name {@code field}, applied to the entity property path {@code property}. */
    public SortPolicy allow(String field, String property) {
        Map<String, String> next = new LinkedHashMap<>(propertiesByField);
        next.put(field, property);
        return new SortPolicy(defaultSort, Map.copyOf(next));
    }

    /** Returns the page request to run: the client's sort translated to properties, or the default sort. */
    public Pageable apply(Pageable requested) {
        if (requested.getSort().isUnsorted()) {
            return PageRequest.of(requested.getPageNumber(), requested.getPageSize(), defaultSort);
        }
        List<Sort.Order> orders = new ArrayList<>();
        for (Sort.Order order : requested.getSort()) {
            String property = propertiesByField.get(order.getProperty());
            if (property == null) {
                throw unknownField(order.getProperty());
            }
            orders.add(order.withProperty(property));
        }
        return PageRequest.of(requested.getPageNumber(), requested.getPageSize(), Sort.by(orders));
    }

    private InvalidInputException unknownField(String field) {
        List<String> allowed = propertiesByField.keySet().stream().sorted().toList();
        return new InvalidInputException(new FieldViolation(
                "sort",
                PlatformErrorCodes.Field.INVALID,
                "Cannot sort by '" + field + "'; allowed: " + String.join(", ", allowed),
                Map.of("allowed", allowed)));
    }
}
