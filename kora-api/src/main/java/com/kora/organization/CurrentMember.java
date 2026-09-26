package com.kora.organization;

import com.kora.platform.error.ForbiddenException;
import com.kora.platform.tenancy.TenantScope;
import java.util.Arrays;

/**
 * The caller's membership in the organization named by {@code X-Organization-Id}, bound for the whole request by
 * the tenant filter once the membership was verified. Like {@link TenantScope}, a {@link ScopedValue}: immutable,
 * and gone when the request ends.
 */
public final class CurrentMember {

    private static final ScopedValue<ActiveMember> CURRENT = ScopedValue.newInstance();

    private CurrentMember() {}

    /**
     * @throws com.kora.platform.error.ProblemException {@code 400 tenant.header_invalid} when the request named no
     *     organization
     */
    public static ActiveMember get() {
        if (CURRENT.isBound()) {
            return CURRENT.get();
        }
        TenantScope.requireOrganization();
        throw new IllegalStateException("An organization scope is bound without a verified member");
    }

    /**
     * Role check at the start of a use case, before anything is loaded: a denied caller gets {@code 403} whether or
     * not the target exists, so the check can't be used to probe for ids.
     */
    public static ActiveMember requireRole(Role... allowed) {
        ActiveMember member = get();
        if (Arrays.stream(allowed).noneMatch(role -> role == member.role())) {
            throw new ForbiddenException("Your role in this organization doesn't allow this");
        }
        return member;
    }

    /** For the tenant filter only: runs the rest of the request as this member. */
    public static <T, X extends Throwable> T callAs(ActiveMember member, ScopedValue.CallableOp<T, X> operation)
            throws X {
        return ScopedValue.where(CURRENT, member).call(operation);
    }
}
