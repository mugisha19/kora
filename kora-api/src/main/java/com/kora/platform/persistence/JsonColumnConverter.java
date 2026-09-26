package com.kora.platform.persistence;

import jakarta.persistence.AttributeConverter;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * Stores a small value collection (a charter's objectives, a portfolio's strategic objectives) as JSON text in one
 * column. They are always read and written with their owner and never queried on their own, so a child table per
 * list would only add joins. Subclass per element type, since JPA needs a concrete converter class.
 */
public abstract class JsonColumnConverter<T> implements AttributeConverter<T, String> {

    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final TypeReference<T> type;

    protected JsonColumnConverter(TypeReference<T> type) {
        this.type = type;
    }

    @Override
    public String convertToDatabaseColumn(T value) {
        return value == null ? null : JSON.writeValueAsString(value);
    }

    @Override
    public T convertToEntityAttribute(String column) {
        return column == null ? null : JSON.readValue(column, type);
    }
}
