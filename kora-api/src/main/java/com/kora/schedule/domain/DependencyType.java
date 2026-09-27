package com.kora.schedule.domain;

/** How a successor waits for its predecessor; the lag is added in working days (negative for a lead). */
public enum DependencyType {
    /** Finish to start: the successor starts after the predecessor finishes. The usual link. */
    FS,
    /** Start to start: the successor starts after the predecessor starts. */
    SS,
    /** Finish to finish: the successor finishes after the predecessor finishes. */
    FF,
    /** Start to finish: the successor finishes after the predecessor starts. Rare. */
    SF
}
