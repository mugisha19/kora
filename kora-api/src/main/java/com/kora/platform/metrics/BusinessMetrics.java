package com.kora.platform.metrics;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

/**
 * Business events as Prometheus counters (feature 24): what the product is used for, next to how the server
 * behaves. Low cardinality on purpose: outcomes and kinds, never ids or organizations.
 */
@Component
public class BusinessMetrics {

    private final MeterRegistry meters;

    public BusinessMetrics(MeterRegistry meters) {
        this.meters = meters;
    }

    /** {@code kora_sign_ins_total{outcome="success|failure"}} */
    public void signIn(boolean succeeded) {
        meters.counter("kora.sign.ins", "outcome", succeeded ? "success" : "failure")
                .increment();
    }

    /** {@code kora_approval_decisions_total{subject="change_request|timesheet", decision="approved|rejected"}} */
    public void decision(String subject, boolean approved) {
        meters.counter("kora.approval.decisions", "subject", subject, "decision", approved ? "approved" : "rejected")
                .increment();
    }
}
