package com.kora.demo;

import com.kora.demo.DemoStory.Tenant;
import com.kora.identity.UserAccounts;
import com.kora.organization.ActiveMember;
import com.kora.organization.CurrentMember;
import com.kora.organization.MemberProvisioning;
import com.kora.organization.Memberships;
import com.kora.platform.demo.DemoHistory;
import com.kora.platform.tenancy.TenantScope;
import java.net.URI;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * Creates the demo organizations once the API is up (feature 22), in the {@code demo} profile only. Idempotent: when
 * the demo administrator exists, it does nothing, so restarts keep what reviewers changed. It tells the story through
 * the public API ({@link DemoStory}), then lets each module fill in the history the API can't create
 * ({@link DemoHistory}).
 */
@Component
@Profile("demo")
class DemoDataSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(DemoDataSeeder.class);
    private static final ZoneId KIGALI = ZoneId.of("Africa/Kigali");

    private final UserAccounts accounts;
    private final MemberProvisioning provisioning;
    private final Memberships memberships;
    private final List<DemoHistory> histories;
    private final JsonMapper json;
    private final Environment environment;
    private final Clock clock;
    private final CompletableFuture<Boolean> completion = new CompletableFuture<>();

    DemoDataSeeder(
            UserAccounts accounts,
            MemberProvisioning provisioning,
            Memberships memberships,
            List<DemoHistory> histories,
            JsonMapper json,
            Environment environment,
            Clock clock) {
        this.accounts = accounts;
        this.provisioning = provisioning;
        this.memberships = memberships;
        this.histories = histories;
        this.json = json;
        this.environment = environment;
        this.clock = clock;
    }

    /** In the background: the API serves requests (and the seeder's own) while the story is told. */
    @EventListener(ApplicationReadyEvent.class)
    void start() {
        Thread.ofVirtual().name("demo-seeder").start(this::seed);
    }

    /** True when the story was told now, false when it already existed. */
    CompletableFuture<Boolean> completion() {
        return completion;
    }

    void seed() {
        try {
            if (accounts.findByEmail(DemoStory.ADMIN).isPresent()) {
                LOG.info("Demo data already present; sign in as {} with the demo password", DemoStory.ADMIN);
                completion.complete(false);
                return;
            }
            LocalDate today = LocalDate.now(clock.withZone(KIGALI));
            URI api =
                    URI.create("http://localhost:" + environment.getRequiredProperty("local.server.port") + "/api/v1");
            List<Tenant> tenants = new DemoStory(new DemoApi(api, json), accounts, provisioning, today).tell();
            for (Tenant tenant : tenants) {
                backfill(tenant, today);
            }
            LOG.info(
                    "Demo data ready: sign in as {}, pmo@kora.demo, pm@kora.demo, member@kora.demo or "
                            + "viewer@kora.demo",
                    DemoStory.ADMIN);
            completion.complete(true);
        } catch (RuntimeException failure) {
            LOG.error("Demo data could not be created", failure);
            completion.completeExceptionally(failure);
        }
    }

    private void backfill(Tenant tenant, LocalDate today) {
        ActiveMember administrator = memberships
                .activeMember(tenant.organizationId(), tenant.administratorId())
                .orElseThrow();
        TenantScope.runAs(
                tenant.organizationId(),
                () -> CurrentMember.callAs(administrator, () -> {
                    histories.forEach(history -> history.backfill(tenant.organizationId(), today));
                    return null;
                }));
    }
}
