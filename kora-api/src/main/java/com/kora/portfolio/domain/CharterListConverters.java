package com.kora.portfolio.domain;

import com.kora.platform.persistence.JsonColumnConverter;
import jakarta.persistence.Converter;
import java.util.List;
import tools.jackson.core.type.TypeReference;

/** JSON columns for the charter's structured lists (JPA needs one concrete converter per element type). */
public final class CharterListConverters {

    private CharterListConverters() {}

    @Converter
    public static class Objectives extends JsonColumnConverter<List<CharterObjective>> {

        public Objectives() {
            super(new TypeReference<>() {});
        }
    }

    @Converter
    public static class Milestones extends JsonColumnConverter<List<CharterMilestone>> {

        public Milestones() {
            super(new TypeReference<>() {});
        }
    }
}
