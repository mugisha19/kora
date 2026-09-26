package com.kora.organization.adapter.web;

import com.kora.organization.Role;
import com.kora.organization.application.InvitationService.InvitationPreview;
import com.kora.organization.domain.Invitation;
import com.kora.organization.domain.Membership;
import com.kora.organization.domain.Organization;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

/** Request and response bodies of the organization endpoints, named after their contract schemas. */
final class OrganizationDtos {

    private OrganizationDtos() {}

    record RegisterOrganizationRequest(
            @NotBlank @Size(min = 2, max = 100) String organizationName,
            @NotBlank @Size(max = 120) String fullName,
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(max = 128) String password,
            @Pattern(regexp = "[A-Z]{3}") String currency,
            @Size(min = 1, max = 64) String timeZone) {

        @Override
        public String toString() {
            return "RegisterOrganizationRequest[organizationName=" + organizationName + ", password=***]";
        }
    }

    record OrganizationResponse(
            UUID id, String name, String slug, String currency, String timeZone, Instant createdAt, long version) {

        static OrganizationResponse from(Organization organization) {
            return new OrganizationResponse(
                    organization.getId(),
                    organization.getName(),
                    organization.getSlug(),
                    organization.getCurrency(),
                    organization.getTimeZone(),
                    organization.getCreatedAt(),
                    organization.getVersion());
        }
    }

    record UpdateOrganizationRequest(
            @Size(min = 2, max = 100) String name,
            @Pattern(regexp = "[A-Z]{3}") String currency,
            @Size(min = 1, max = 64) String timeZone) {}

    record MemberResponse(
            UUID id, UUID userId, String email, String fullName, Role role, Instant joinedAt, long version) {

        static MemberResponse from(Membership membership) {
            return new MemberResponse(
                    membership.getId(),
                    membership.getUserId(),
                    membership.getMemberEmail(),
                    membership.getMemberName(),
                    membership.getRole(),
                    membership.getJoinedAt(),
                    membership.getVersion());
        }
    }

    record ChangeMemberRoleRequest(@NotNull Role role) {}

    record InvitationResponse(
            UUID id,
            String email,
            Role role,
            String status,
            String invitedByName,
            Instant createdAt,
            Instant expiresAt) {

        /** Shows the effective status: a pending invitation past its expiry is listed as expired. */
        static InvitationResponse from(Invitation invitation, Clock clock) {
            return new InvitationResponse(
                    invitation.getId(),
                    invitation.getEmail(),
                    invitation.getRole(),
                    invitation.effectiveStatus(clock.instant()).name(),
                    invitation.getInvitedByName(),
                    invitation.getCreatedAt(),
                    invitation.getExpiresAt());
        }
    }

    record CreateInvitationRequest(
            @NotBlank @Email @Size(max = 254) String email,
            @NotNull Role role) {}

    record InvitationPreviewResponse(
            String organizationName,
            String email,
            Role role,
            String invitedByName,
            Instant expiresAt,
            boolean existingAccount) {

        static InvitationPreviewResponse from(InvitationPreview preview) {
            return new InvitationPreviewResponse(
                    preview.organizationName(),
                    preview.email(),
                    preview.role(),
                    preview.invitedByName(),
                    preview.expiresAt(),
                    preview.existingAccount());
        }
    }

    record AcceptInvitationRequest(
            @Size(min = 1, max = 120) String fullName,
            @NotBlank @Size(max = 128) String password) {

        @Override
        public String toString() {
            return "AcceptInvitationRequest[password=***]";
        }
    }
}
