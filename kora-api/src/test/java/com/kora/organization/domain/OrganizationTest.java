package com.kora.organization.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kora.platform.error.InvalidInputException;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class OrganizationTest {

    private static Organization organization() {
        return Organization.create(
                UUID.randomUUID(), "  Akagera Digital  ", "akagera", "RWF", "Africa/Kigali", Instant.now());
    }

    @Test
    void trimsTheName() {
        assertThat(organization().getName()).isEqualTo("Akagera Digital");
    }

    @ParameterizedTest
    @ValueSource(strings = {"ZZZ", "rwf", "RW", "EURO"})
    void acceptsOnlyIso4217Currencies(String currency) {
        assertThatThrownBy(() -> organization().changeCurrency(currency))
                .isInstanceOf(InvalidInputException.class)
                .satisfies(e -> assertThat(((InvalidInputException) e)
                                .violations()
                                .getFirst()
                                .field())
                        .isEqualTo("currency"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"+02:00", "CAT", "Mars/Olympus", ""})
    void acceptsOnlyIanaRegionTimeZones(String timeZone) {
        assertThatThrownBy(() -> organization().changeTimeZone(timeZone)).isInstanceOf(InvalidInputException.class);
    }

    @Test
    void acceptsValidSettings() {
        Organization organization = organization();
        organization.changeCurrency("USD");
        organization.changeTimeZone("Europe/Paris");

        assertThat(organization.getCurrency()).isEqualTo("USD");
        assertThat(organization.getTimeZone()).isEqualTo("Europe/Paris");
    }

    @ParameterizedTest
    @CsvSource({"x", "'   a   '"})
    void needsAtLeastTwoCharacters(String name) {
        assertThatThrownBy(() -> organization().rename(name)).isInstanceOf(InvalidInputException.class);
    }
}
