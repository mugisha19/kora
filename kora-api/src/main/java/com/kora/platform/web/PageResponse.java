package com.kora.platform.web;

import java.util.List;
import java.util.function.Function;
import org.springframework.data.domain.Page;

/**
 * The contract's paged list shape: {@code {content, page, size, totalElements, totalPages}}, with a 0-based page.
 *
 * <p>Spring Data's {@code Page} is never serialized directly: its JSON layout is an implementation detail that has
 * changed between versions, and the contract must not change with it.
 */
public record PageResponse<T>(List<T> content, int page, int size, long totalElements, int totalPages) {

    public PageResponse {
        content = List.copyOf(content);
    }

    public static <T> PageResponse<T> from(Page<T> page) {
        return from(page, Function.identity());
    }

    public static <S, T> PageResponse<T> from(Page<S> page, Function<? super S, ? extends T> mapper) {
        List<T> content = page.getContent().stream().<T>map(mapper).toList();
        return new PageResponse<>(
                content, page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages());
    }
}
