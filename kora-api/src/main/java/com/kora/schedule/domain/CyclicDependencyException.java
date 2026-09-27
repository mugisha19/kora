package com.kora.schedule.domain;

import java.util.List;
import java.util.UUID;

/** The dependencies form a loop, so no schedule exists. The service turns it into {@code 409 schedule.cycle}. */
public class CyclicDependencyException extends RuntimeException {

    private final transient List<UUID> cycle;

    /** @param cycle the activities around the loop, the first repeated at the end */
    public CyclicDependencyException(List<UUID> cycle) {
        super("The dependencies form a loop: " + cycle);
        this.cycle = List.copyOf(cycle);
    }

    public List<UUID> cycle() {
        return cycle;
    }
}
