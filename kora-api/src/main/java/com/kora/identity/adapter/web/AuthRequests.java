package com.kora.identity.adapter.web;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request bodies of {@code /auth/*} (contract schemas of the same names). Only shape is validated here; the password
 * policy (length, breached list) is a domain rule and applies wherever a password is set.
 */
final class AuthRequests {

    private AuthRequests() {}

    record LoginRequest(
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(max = 128) String password) {

        @Override
        public String toString() {
            return "LoginRequest[password=***]";
        }
    }

    record ForgotPasswordRequest(
            @NotBlank @Email @Size(max = 254) String email) {}

    record ResetPasswordRequest(
            @NotBlank @Size(min = 20, max = 200) String token,
            @NotBlank @Size(max = 128) String newPassword) {

        @Override
        public String toString() {
            return "ResetPasswordRequest[***]";
        }
    }
}
