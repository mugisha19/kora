/**
 * Shared kernel used by every module: the error model and its HTTP mapping, correlation ids, paging and
 * optimistic-locking helpers. It holds no business rules and depends on no other module.
 *
 * <p>Declared {@code OPEN} so other modules may use its sub-packages ({@code error}, {@code web}) directly; every
 * other module keeps its internals closed.
 */
@ApplicationModule(displayName = "Platform", type = ApplicationModule.Type.OPEN)
package com.kora.platform;

import org.springframework.modulith.ApplicationModule;
