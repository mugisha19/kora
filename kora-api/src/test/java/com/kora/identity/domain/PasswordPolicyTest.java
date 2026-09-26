package com.kora.identity.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import java.util.Set;
import org.junit.jupiter.api.Test;

class PasswordPolicyTest {

    private final PasswordPolicy policy =
            new PasswordPolicy(password -> Set.of("password1234").contains(password));

    @Test
    void acceptsTwelveToOneHundredTwentyEightCharacters() {
        assertThatNoException().isThrownBy(() -> policy.check("password", "x".repeat(12)));
        assertThatNoException().isThrownBy(() -> policy.check("password", "x".repeat(128)));
    }

    @Test
    void rejectsOtherLengthsOnTheGivenField() {
        assertThat(violation(() -> policy.check("newPassword", "x".repeat(11))))
                .extracting(FieldViolation::field, FieldViolation::code)
                .containsExactly("newPassword", "length");
        assertThat(violation(() -> policy.check("password", "x".repeat(129))).params())
                .containsEntry("min", 12)
                .containsEntry("max", 128);
    }

    @Test
    void countsCharactersNotUtf16Units() {
        // Six emoji are 12 UTF-16 units but only 6 characters: too short.
        assertThatThrownBy(() -> policy.check("password", "🔒🔒🔒🔒🔒🔒")).isInstanceOf(InvalidInputException.class);
    }

    @Test
    void rejectsBreachedPasswords() {
        assertThat(violation(() -> policy.check("password", "password1234")).code())
                .isEqualTo("password.breached");
    }

    private static FieldViolation violation(Runnable check) {
        try {
            check.run();
        } catch (InvalidInputException e) {
            return e.violations().getFirst();
        }
        throw new AssertionError("Expected the password to be rejected");
    }
}
