package com.kora.portfolio.application;

import com.kora.identity.AccountView;
import com.kora.identity.UserAccounts;
import com.kora.organization.MemberDirectory;
import com.kora.organization.MemberSummary;
import com.kora.organization.Role;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import java.util.Collection;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** Validates and names the people a portfolio object refers to (owners, managers, sponsors, team members). */
@Component
public class People {

    /** Who may own a portfolio. */
    public static final Set<Role> GOVERNORS = EnumSet.of(Role.ORG_ADMIN, Role.PMO);

    /** Who may manage a program or project. */
    public static final Set<Role> MANAGERS = EnumSet.of(Role.ORG_ADMIN, Role.PMO, Role.PROJECT_MANAGER);

    private final MemberDirectory directory;
    private final UserAccounts accounts;

    People(MemberDirectory directory, UserAccounts accounts) {
        this.directory = directory;
        this.accounts = accounts;
    }

    /** Name and email for display. */
    public record Person(String fullName, String email) {}

    /** @throws InvalidInputException on {@code field} unless the user belongs to the active organization */
    public MemberSummary requireMember(UUID userId, String field) {
        return directory
                .find(userId)
                .orElseThrow(() -> new InvalidInputException(FieldViolation.of(
                        field, PlatformErrorCodes.Field.INVALID, "is not a member of this organization")));
    }

    /** @throws InvalidInputException on {@code field} unless the member holds one of {@code roles} */
    public MemberSummary requireRole(UUID userId, String field, Set<Role> roles) {
        MemberSummary member = requireMember(userId, field);
        if (!roles.contains(member.role())) {
            throw new InvalidInputException(FieldViolation.of(
                    field, PlatformErrorCodes.Field.INVALID, "must be one of " + roles + " in this organization"));
        }
        return member;
    }

    /**
     * Names for display, in one query for current members. Someone who has left the organization still manages the
     * projects they managed until reassigned, so they are looked up in their account instead of disappearing.
     */
    public Map<UUID, Person> lookup(Collection<UUID> userIds) {
        List<UUID> ids = userIds.stream().filter(Objects::nonNull).distinct().toList();
        Map<UUID, Person> people = new HashMap<>();
        directory.findAll(ids).forEach((id, member) -> people.put(id, new Person(member.fullName(), member.email())));
        for (UUID id : ids) {
            if (!people.containsKey(id)) {
                AccountView account = accounts.get(id);
                people.put(id, new Person(account.fullName(), account.email()));
            }
        }
        return people;
    }
}
