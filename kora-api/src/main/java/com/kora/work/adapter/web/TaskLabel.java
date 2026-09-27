package com.kora.work.adapter.web;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import jakarta.validation.constraints.Pattern;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * A task label: 1 to 30 letters, digits, spaces, {@code _} or {@code -}, starting with a letter or digit. The
 * violation is the composed {@link Pattern}'s, so clients see the same {@code format} error.
 *
 * <p>A constraint of its own rather than {@code @Pattern(regexp = CONSTANT)} on the list's type argument: with a
 * constant in a type annotation there, javac sometimes wrote the record component's generic signature as
 * {@code List<E>} on incremental builds, and validation then failed at run time (LEARNING.md).
 */
@Pattern(regexp = "[\\p{L}\\p{N}][\\p{L}\\p{N} _-]{0,29}") @Constraint(validatedBy = {})
@Target({ElementType.TYPE_USE, ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@interface TaskLabel {

    String message() default "must be 1 to 30 letters, digits, spaces, _ or -";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
