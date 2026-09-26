package com.kora.portfolio.application;

import java.util.UUID;

/** A count per owner id, e.g. projects per portfolio (a JPQL constructor-expression result). */
public record OwnerCount(UUID ownerId, long count) {}
