package com.kora.platform.audit;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Leaves an entity or a field out of the audit trail: derived read models, counters, children recorded through their
 * parent, and fields a job recomputes (feature 19).
 */
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.TYPE, ElementType.FIELD})
public @interface NotAudited {}
