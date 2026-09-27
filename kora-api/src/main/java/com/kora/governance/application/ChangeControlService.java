package com.kora.governance.application;

import com.kora.governance.domain.ChangeControlSettings;
import com.kora.organization.ActiveMember;
import com.kora.organization.CurrentMember;
import com.kora.organization.Role;
import com.kora.platform.error.OptimisticLock;
import java.math.BigDecimal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The organization's change-control thresholds (feature 14): everyone reads them, administrators change them. */
@Service
public class ChangeControlService {

    private final ChangeControlSettingsRepository settings;

    ChangeControlService(ChangeControlSettingsRepository settings) {
        this.settings = settings;
    }

    @Transactional(readOnly = true)
    public ChangeControlSettings current() {
        return settings.findFirstBy()
                .orElseGet(
                        () -> ChangeControlSettings.standard(CurrentMember.get().organizationId()));
    }

    /** Stores the defaults first (version 0), then changes them, as the working calendar does (ADR 0010). */
    @Transactional
    public ChangeControlSettings replace(
            long expectedVersion, BigDecimal pmoCostPercent, int pmoScheduleDays, BigDecimal sponsorCostPercent) {
        ActiveMember member = CurrentMember.requireRole(Role.ORG_ADMIN);
        ChangeControlSettings current = settings.findFirstBy()
                .orElseGet(() -> settings.saveAndFlush(ChangeControlSettings.standard(member.organizationId())));
        OptimisticLock.check(expectedVersion, current.getVersion());
        current.change(pmoCostPercent, pmoScheduleDays, sponsorCostPercent);
        return settings.saveAndFlush(current);
    }
}
