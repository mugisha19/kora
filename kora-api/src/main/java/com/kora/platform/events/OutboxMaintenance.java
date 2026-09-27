package com.kora.platform.events;

import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.modulith.events.CompletedEventPublications;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.modulith.events.ResubmissionOptions;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Keeps the transactional outbox (ADR 0013) healthy while the application runs:
 *
 * <ul>
 *   <li>retries deliveries whose listener failed (a mail relay down, a deadlock), a few times, once they are old
 *       enough that no listener can still be working on them;
 *   <li>deletes completed publications after a week, so the table stays small.
 * </ul>
 *
 * Deliveries interrupted by a shutdown are handled at startup ({@code republish-outstanding-events-on-restart}).
 */
@Component
class OutboxMaintenance {

    private static final Logger LOG = LoggerFactory.getLogger(OutboxMaintenance.class);

    /** Longer than any listener runs (a report takes seconds), so a retry never races the first attempt. */
    static final Duration RETRY_AFTER = Duration.ofMinutes(15);

    static final int MAX_ATTEMPTS = 5;
    static final Duration KEEP_COMPLETED = Duration.ofDays(7);

    private final IncompleteEventPublications incomplete;
    private final CompletedEventPublications completed;

    OutboxMaintenance(IncompleteEventPublications incomplete, CompletedEventPublications completed) {
        this.incomplete = incomplete;
        this.completed = completed;
    }

    @Scheduled(
            initialDelayString = "${kora.outbox.retry.initial-delay:PT5M}",
            fixedDelayString = "${kora.outbox.retry.interval:PT5M}")
    void retryFailed() {
        try {
            incomplete.resubmitIncompletePublications(ResubmissionOptions.defaults()
                    .withMinAge(RETRY_AFTER)
                    .withBatchSize(100)
                    .withFilter(publication -> publication.getCompletionAttempts() < MAX_ATTEMPTS));
        } catch (RuntimeException failure) {
            LOG.warn("Could not resubmit outbox publications", failure);
        }
    }

    @Scheduled(
            initialDelayString = "${kora.outbox.prune.initial-delay:PT30M}",
            fixedDelayString = "${kora.outbox.prune.interval:PT24H}")
    void pruneCompleted() {
        try {
            completed.deletePublicationsOlderThan(KEEP_COMPLETED);
        } catch (RuntimeException failure) {
            LOG.warn("Could not prune completed outbox publications", failure);
        }
    }
}
