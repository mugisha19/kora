package com.kora.demo;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class DemoProfileGuardTest {

    @Test
    void theDemoNeverStartsNextToProduction() {
        MockEnvironment production = new MockEnvironment();
        production.setActiveProfiles("demo", "prod");

        assertThatThrownBy(() -> new DemoProfileGuard(production))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("published password");
    }

    @Test
    void theDemoStartsOnItsOwn() {
        MockEnvironment demo = new MockEnvironment();
        demo.setActiveProfiles("demo");

        assertThatCode(() -> new DemoProfileGuard(demo)).doesNotThrowAnyException();
    }
}
