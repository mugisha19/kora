package com.kora.organization.adapter.web;

import com.kora.identity.web.SessionResponse;
import com.kora.identity.web.SessionResponses;
import com.kora.organization.adapter.web.OrganizationDtos.AcceptInvitationRequest;
import com.kora.organization.adapter.web.OrganizationDtos.CreateInvitationRequest;
import com.kora.organization.adapter.web.OrganizationDtos.InvitationPreviewResponse;
import com.kora.organization.adapter.web.OrganizationDtos.InvitationResponse;
import com.kora.organization.application.InvitationService;
import com.kora.organization.domain.Invitation;
import com.kora.organization.domain.InvitationStatus;
import com.kora.platform.web.PageResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.net.URI;
import java.time.Clock;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Contract tag {@code Invitations}: administration (tenant-scoped) and the public invitation link. */
@RestController
@RequestMapping("/api/v1/invitations")
class InvitationsController {

    private final InvitationService invitations;
    private final SessionResponses responses;
    private final Clock clock;

    InvitationsController(InvitationService invitations, SessionResponses responses, Clock clock) {
        this.invitations = invitations;
        this.responses = responses;
        this.clock = clock;
    }

    @GetMapping
    PageResponse<InvitationResponse> list(
            @RequestParam(name = "status", required = false) InvitationStatus status, Pageable pageable) {
        return PageResponse.from(
                invitations.list(status, pageable), invitation -> InvitationResponse.from(invitation, clock));
    }

    @PostMapping
    ResponseEntity<InvitationResponse> invite(@Valid @RequestBody CreateInvitationRequest body) {
        Invitation invitation = invitations.invite(body.email(), body.role());
        return ResponseEntity.created(URI.create("/api/v1/invitations/" + invitation.getId()))
                .body(InvitationResponse.from(invitation, clock));
    }

    @DeleteMapping("/{invitationId}")
    ResponseEntity<Void> revoke(@PathVariable("invitationId") UUID invitationId) {
        invitations.revoke(invitationId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/token/{token}")
    InvitationPreviewResponse preview(@PathVariable("token") String token, HttpServletRequest request) {
        return InvitationPreviewResponse.from(invitations.preview(token, request.getRemoteAddr()));
    }

    @PostMapping("/token/{token}/accept")
    ResponseEntity<SessionResponse> accept(
            @PathVariable("token") String token,
            @Valid @RequestBody AcceptInvitationRequest body,
            HttpServletRequest request) {
        return responses.respond(
                HttpStatus.OK, invitations.accept(token, body.fullName(), body.password(), request.getRemoteAddr()));
    }
}
