/**
 * Organizations and who belongs to them: tenancy, memberships and roles, invitations (features 02 and 03).
 *
 * <p>Other modules use {@link com.kora.organization.CurrentMember} to learn the active organization and the caller's
 * {@link com.kora.organization.Role} there. It is bound per request by the tenant filter after it has checked the
 * {@code X-Organization-Id} header against the caller's memberships.
 */
@ApplicationModule(displayName = "Organization")
package com.kora.organization;

import org.springframework.modulith.ApplicationModule;
