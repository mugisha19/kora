package com.kora.organization.application;

import com.kora.organization.ActiveMember;
import com.kora.organization.CurrentMember;
import com.kora.organization.Role;
import com.kora.organization.domain.Organization;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.OptimisticLock;
import com.kora.platform.error.PlatformErrorCodes;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The active organization's settings (feature 02). */
@Service
public class OrganizationService {

    private final OrganizationRepository organizations;

    OrganizationService(OrganizationRepository organizations) {
        this.organizations = organizations;
    }

    @Transactional(readOnly = true)
    public Organization current() {
        ActiveMember member = CurrentMember.get();
        return organizations
                .findById(member.organizationId())
                .orElseThrow(() -> NotFoundException.of("Organization", member.organizationId()));
    }

    /** Only the fields given change (null means "leave as is"). {@code ORG_ADMIN} only. */
    @Transactional
    public Organization update(long expectedVersion, String name, String currency, String timeZone) {
        ActiveMember member = CurrentMember.requireRole(Role.ORG_ADMIN);
        if (name == null && currency == null && timeZone == null) {
            throw new InvalidInputException(FieldViolation.of(
                    "body", PlatformErrorCodes.Field.REQUIRED, "Send name, currency, timeZone or a combination"));
        }
        Organization organization = organizations
                .findById(member.organizationId())
                .orElseThrow(() -> NotFoundException.of("Organization", member.organizationId()));
        OptimisticLock.check(expectedVersion, organization.getVersion());
        if (name != null) {
            organization.rename(name);
        }
        if (currency != null) {
            organization.changeCurrency(currency);
        }
        if (timeZone != null) {
            organization.changeTimeZone(timeZone);
        }
        return organizations.saveAndFlush(organization);
    }
}
