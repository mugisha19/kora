package com.kora.governance.domain;

import java.util.EnumSet;
import java.util.Set;

/**
 * PMBOK risk response strategies. Threats are avoided, mitigated, transferred; opportunities are exploited, enhanced,
 * shared; either can be accepted or escalated beyond the project.
 */
public enum ResponseStrategy {
    AVOID,
    MITIGATE,
    TRANSFER,
    EXPLOIT,
    ENHANCE,
    SHARE,
    ACCEPT,
    ESCALATE;

    private static final Set<ResponseStrategy> FOR_THREATS = EnumSet.of(AVOID, MITIGATE, TRANSFER, ACCEPT, ESCALATE);
    private static final Set<ResponseStrategy> FOR_OPPORTUNITIES =
            EnumSet.of(EXPLOIT, ENHANCE, SHARE, ACCEPT, ESCALATE);

    public boolean fits(RiskKind kind) {
        return (kind == RiskKind.THREAT ? FOR_THREATS : FOR_OPPORTUNITIES).contains(this);
    }
}
