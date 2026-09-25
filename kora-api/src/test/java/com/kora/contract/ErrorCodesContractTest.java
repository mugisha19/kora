package com.kora.contract;

import static com.kora.contract.OpenApiContract.resolve;
import static com.kora.contract.OpenApiContract.spec;
import static org.assertj.core.api.Assertions.assertThat;

import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/**
 * Error codes are part of the contract: the web client maps each one to a translated message. The contract's
 * {@code ErrorCode} enum is the registry, and these tests stop codes from drifting on either side.
 */
class ErrorCodesContractTest {

    /** Backticked tokens such as {@code `members.last_admin`} or {@code `rate_limited`} in response descriptions. */
    private static final Pattern CODE_IN_DESCRIPTION = Pattern.compile("`([a-z_]+(?:\\.[a-z_]+)+|rate_limited)`");

    @Test
    void everyCodeTheApiCanReturnIsInTheContract() {
        Set<String> declared = declaredCodes();
        Set<String> inCode = new TreeSet<>();
        new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS).importPackages("com.kora").stream()
                        .filter(javaClass -> javaClass.getSimpleName().endsWith("ErrorCodes"))
                        .map(JavaClass::reflect)
                        .forEach(type -> inCode.addAll(stringConstants(type)));

        assertThat(inCode).isNotEmpty();
        assertThat(declared)
                .as("ErrorCode enum in docs/openapi.yaml must list every *ErrorCodes constant")
                .containsAll(inCode);
    }

    @Test
    void everyCodeMentionedInAResponseIsInTheEnum() {
        Set<String> mentioned = new TreeSet<>();
        spec().getPaths()
                .values()
                .forEach(item -> item.readOperations()
                        .forEach(operation -> operation.getResponses().values().forEach(response -> {
                            String description = resolve(response).getDescription();
                            Matcher matcher = CODE_IN_DESCRIPTION.matcher(description == null ? "" : description);
                            while (matcher.find()) {
                                mentioned.add(matcher.group(1));
                            }
                        })));

        assertThat(mentioned).isNotEmpty();
        assertThat(declaredCodes()).containsAll(mentioned);
    }

    @SuppressWarnings("unchecked")
    private static Set<String> declaredCodes() {
        return new TreeSet<>((List<String>)
                spec().getComponents().getSchemas().get("ErrorCode").getEnum());
    }

    /** Top-level public constants only: nested classes such as {@code PlatformErrorCodes.Field} hold field reasons. */
    private static Set<String> stringConstants(Class<?> type) {
        return Arrays.stream(type.getDeclaredFields())
                .filter(field -> field.getType() == String.class)
                .filter(field -> Modifier.isPublic(field.getModifiers())
                        && Modifier.isStatic(field.getModifiers())
                        && Modifier.isFinal(field.getModifiers()))
                .map(ErrorCodesContractTest::valueOf)
                .collect(Collectors.toSet());
    }

    private static String valueOf(Field field) {
        try {
            return (String) field.get(null);
        } catch (IllegalAccessException e) {
            throw new IllegalStateException(e);
        }
    }
}
