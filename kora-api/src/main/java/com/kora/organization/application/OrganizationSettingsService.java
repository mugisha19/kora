package com.kora.organization.application;

import com.kora.organization.OrganizationCurrency;
import com.kora.organization.OrganizationName;
import com.kora.organization.OrganizationTimeZone;
import com.kora.organization.domain.Organization;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.tenancy.TenantScope;
import java.time.ZoneId;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
/** The active organization's settings as other modules read them. */
class OrganizationSettingsService implements OrganizationCurrency, OrganizationTimeZone, OrganizationName {

    private final OrganizationRepository organizations;

    OrganizationSettingsService(OrganizationRepository organizations) {
        this.organizations = organizations;
    }

    @Override
    @Transactional(readOnly = true)
    public String current() {
        return organization().getCurrency();
    }

    @Override
    @Transactional(readOnly = true)
    public String name() {
        return organization().getName();
    }

    @Override
    @Transactional(readOnly = true)
    public ZoneId zone() {
        return ZoneId.of(organization().getTimeZone());
    }

    private Organization organization() {
        // The tenant scope rather than the current member: scheduled jobs have a scope but no member.
        UUID organizationId = TenantScope.requireOrganization();
        return organizations
                .findById(organizationId)
                .orElseThrow(() -> NotFoundException.of("Organization", organizationId));
    }
}
