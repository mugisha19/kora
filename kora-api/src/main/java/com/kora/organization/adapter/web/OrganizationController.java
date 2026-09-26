package com.kora.organization.adapter.web;

import com.kora.organization.adapter.web.OrganizationDtos.OrganizationResponse;
import com.kora.organization.adapter.web.OrganizationDtos.UpdateOrganizationRequest;
import com.kora.organization.application.OrganizationService;
import com.kora.organization.domain.Organization;
import com.kora.platform.web.EntityTags;
import com.kora.platform.web.IfMatchVersion;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code Organization}: the active organization's settings. */
@RestController
@RequestMapping("/api/v1/organization")
class OrganizationController {

    private final OrganizationService organizations;

    OrganizationController(OrganizationService organizations) {
        this.organizations = organizations;
    }

    @GetMapping
    ResponseEntity<OrganizationResponse> get() {
        return withETag(organizations.current());
    }

    @PatchMapping
    ResponseEntity<OrganizationResponse> update(
            @IfMatchVersion long expectedVersion, @Valid @RequestBody UpdateOrganizationRequest body) {
        return withETag(organizations.update(expectedVersion, body.name(), body.currency(), body.timeZone()));
    }

    private static ResponseEntity<OrganizationResponse> withETag(Organization organization) {
        return ResponseEntity.ok()
                .eTag(EntityTags.of(organization.getVersion()))
                .body(OrganizationResponse.from(organization));
    }
}
