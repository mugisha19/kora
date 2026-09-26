package com.kora.organization.adapter.web;

import com.kora.identity.web.SessionResponse;
import com.kora.identity.web.SessionResponses;
import com.kora.organization.adapter.web.OrganizationDtos.RegisterOrganizationRequest;
import com.kora.organization.application.RegistrationService;
import com.kora.organization.application.RegistrationService.RegisterOrganization;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code POST /auth/register-organization}: under {@code /auth} in the contract because it signs the user in, but
 * owned by this module because it creates an organization.
 */
@RestController
class RegistrationController {

    private final RegistrationService registration;
    private final SessionResponses responses;

    RegistrationController(RegistrationService registration, SessionResponses responses) {
        this.registration = registration;
        this.responses = responses;
    }

    @PostMapping("/api/v1/auth/register-organization")
    ResponseEntity<SessionResponse> register(
            @Valid @RequestBody RegisterOrganizationRequest body, HttpServletRequest request) {
        RegisterOrganization command = new RegisterOrganization(
                body.organizationName(),
                body.fullName(),
                body.email(),
                body.password(),
                body.currency(),
                body.timeZone());
        return responses.respond(HttpStatus.CREATED, registration.register(command, request.getRemoteAddr()));
    }
}
