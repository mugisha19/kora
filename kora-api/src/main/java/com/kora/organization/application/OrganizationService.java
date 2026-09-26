package com.kora.organization.application;

import com.kora.organization.ActiveMember;
import com.kora.organization.CurrencyUsage;
import com.kora.organization.CurrentMember;
import com.kora.organization.OrganizationErrorCodes;
import com.kora.organization.Role;
import com.kora.organization.domain.Organization;
import com.kora.platform.error.ConflictException;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.OptimisticLock;
import com.kora.platform.error.PlatformErrorCodes;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The active organization's settings (feature 02). */
@Service
public class OrganizationService {

    private final OrganizationRepository organizations;
    private final ObjectProvider<CurrencyUsage> currencyUsages;

    OrganizationService(OrganizationRepository organizations, ObjectProvider<CurrencyUsage> currencyUsages) {
        this.organizations = organizations;
        this.currencyUsages = currencyUsages;
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
        if (currency != null && !currency.equals(organization.getCurrency())) {
            if (currencyUsages.stream().anyMatch(CurrencyUsage::currencyInUse)) {
                throw new ConflictException(
                        OrganizationErrorCodes.CURRENCY_LOCKED,
                        "Budgets and costs already use " + organization.getCurrency() + "; the currency can't change");
            }
            organization.changeCurrency(currency);
        }
        if (timeZone != null) {
            organization.changeTimeZone(timeZone);
        }
        return organizations.saveAndFlush(organization);
    }
}
