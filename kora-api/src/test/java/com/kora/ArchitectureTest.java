package com.kora;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.GeneralCodingRules.NO_CLASSES_SHOULD_ACCESS_STANDARD_STREAMS;
import static com.tngtech.archunit.library.GeneralCodingRules.NO_CLASSES_SHOULD_THROW_GENERIC_EXCEPTIONS;
import static com.tngtech.archunit.library.GeneralCodingRules.NO_CLASSES_SHOULD_USE_FIELD_INJECTION;
import static com.tngtech.archunit.library.GeneralCodingRules.NO_CLASSES_SHOULD_USE_JAVA_UTIL_LOGGING;
import static com.tngtech.archunit.library.GeneralCodingRules.NO_CLASSES_SHOULD_USE_JODATIME;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import org.springframework.data.repository.Repository;
import org.springframework.web.bind.annotation.RestController;

/**
 * Hexagonal layering inside every module (ADR 0004). Spring Modulith guards the boundaries between modules;
 * these rules guard the direction of dependencies within one: {@code adapter -> application -> domain}.
 *
 * <p>Layer rules allow an empty match because Phase 0 has no modules yet; they bite as soon as a module lands.
 * Rule fields are camelCase on purpose: ArchUnit reports each field name as the test name.
 */
@AnalyzeClasses(packages = "com.kora", importOptions = ImportOption.DoNotIncludeTests.class)
@SuppressWarnings("checkstyle:ConstantName")
class ArchitectureTest {

    private static final String DOMAIN = "com.kora..domain..";
    private static final String APPLICATION = "com.kora..application..";
    private static final String ADAPTER = "com.kora..adapter..";

    @ArchTest
    static final ArchRule domainIsFrameworkFree = noClasses()
            .that()
            .resideInAPackage(DOMAIN)
            .should()
            .dependOnClassesThat()
            // JPA mapping annotations are allowed on domain entities (pragmatic hexagonal, ADR 0004); Spring is not.
            .resideInAnyPackage("org.springframework..", APPLICATION, ADAPTER)
            .allowEmptyShould(true);

    @ArchTest
    static final ArchRule applicationDoesNotDependOnAdapters = noClasses()
            .that()
            .resideInAPackage(APPLICATION)
            .should()
            .dependOnClassesThat()
            .resideInAPackage(ADAPTER)
            .allowEmptyShould(true);

    @ArchTest
    static final ArchRule controllersLiveInWebAdapters = classes()
            .that()
            .areAnnotatedWith(RestController.class)
            .should()
            .resideInAPackage("com.kora..adapter.web..")
            .allowEmptyShould(true);

    @ArchTest
    static final ArchRule springDataRepositoriesLiveInPersistenceAdapters = classes()
            .that()
            .areAssignableTo(Repository.class)
            .should()
            .resideInAPackage("com.kora..adapter.persistence..")
            .allowEmptyShould(true);

    @ArchTest
    static final ArchRule noStandardStreams = NO_CLASSES_SHOULD_ACCESS_STANDARD_STREAMS;

    @ArchTest
    static final ArchRule noGenericExceptions = NO_CLASSES_SHOULD_THROW_GENERIC_EXCEPTIONS;

    @ArchTest
    static final ArchRule constructorInjectionOnly = NO_CLASSES_SHOULD_USE_FIELD_INJECTION.allowEmptyShould(true);

    @ArchTest
    static final ArchRule slf4jOnly = NO_CLASSES_SHOULD_USE_JAVA_UTIL_LOGGING;

    @ArchTest
    static final ArchRule javaTimeOnly = NO_CLASSES_SHOULD_USE_JODATIME;
}
