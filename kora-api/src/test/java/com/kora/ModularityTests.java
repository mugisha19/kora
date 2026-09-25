package com.kora;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;
import org.springframework.modulith.docs.Documenter;

/**
 * Verifies the module structure without starting Spring: no dependency cycles between modules, and no module
 * reaching into another module's internal packages. Runs as a plain unit test, so it's cheap to keep green.
 */
class ModularityTests {

    private static final ApplicationModules MODULES = ApplicationModules.of(KoraApplication.class);

    @Test
    void modulesRespectTheirBoundaries() {
        MODULES.verify();
    }

    @Test
    void writesModuleDocumentation() {
        // C4 and UML component diagrams plus a module canvas per module, in target/spring-modulith-docs.
        new Documenter(MODULES).writeDocumentation();
    }
}
