package com.kora;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Kora API entry point.
 *
 * <p>Kora is a modular monolith: every direct sub-package of {@code com.kora} is a Spring Modulith application
 * module (identity, organization, portfolio, work, ...), and each module is layered hexagonally into
 * {@code domain}, {@code application} and {@code adapter} packages. Boundaries are verified by
 * {@code ModularityTests} and {@code ArchitectureTest} rather than by convention alone (ADR 0004).
 */
@SpringBootApplication
public class KoraApplication {

    public static void main(String[] args) {
        SpringApplication.run(KoraApplication.class, args);
    }
}
