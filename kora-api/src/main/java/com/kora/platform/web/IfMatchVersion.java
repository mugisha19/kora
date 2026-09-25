package com.kora.platform.web;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Binds the version from a mandatory {@code If-Match} header to a {@code long} controller parameter:
 *
 * <pre>{@code
 * @PatchMapping("/organization")
 * Organization update(@IfMatchVersion long expectedVersion, @Valid @RequestBody UpdateOrganizationRequest body)
 * }</pre>
 *
 * A missing or malformed header fails with {@code 428 concurrency.if_match_required} before the controller runs.
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface IfMatchVersion {}
