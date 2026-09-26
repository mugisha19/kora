package com.kora.platform.persistence;

import jakarta.persistence.Converter;
import java.util.List;
import tools.jackson.core.type.TypeReference;

/** A {@code List<String>} as a JSON array in a text column. */
@Converter
public class StringListConverter extends JsonColumnConverter<List<String>> {

    public StringListConverter() {
        super(new TypeReference<>() {});
    }
}
