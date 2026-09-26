package com.kora.organization.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class SlugsTest {

    @ParameterizedTest
    @CsvSource({
        "Akagera Digital Ltd, akagera-digital-ltd",
        "  Virunga -- Build & Partners!  , virunga-build-partners",
        "Société Générale Rwanda, societe-generale-rwanda",
        "Umurenge SACCO 2026, umurenge-sacco-2026",
        "!!!, organization"
    })
    void makesUrlFriendlyNames(String name, String slug) {
        assertThat(Slugs.from(name)).isEqualTo(slug);
    }

    @Test
    void capsTheLengthWithoutATrailingDash() {
        String slug = Slugs.from("a".repeat(99) + " bcd");

        assertThat(slug).hasSizeLessThanOrEqualTo(100).doesNotEndWith("-");
    }
}
