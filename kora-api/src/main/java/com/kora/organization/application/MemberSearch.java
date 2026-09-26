package com.kora.organization.application;

import com.kora.organization.Role;

/** Member list filters: {@code q} matches name or email (case-insensitive), {@code role} is exact. Both optional. */
public record MemberSearch(String q, Role role) {}
