package com.kora.identity.domain;

/**
 * Knows passwords that attackers try first because they appeared in breaches. A port, so the bundled list can be
 * replaced by a bigger one or by a k-anonymity lookup (Have I Been Pwned) without touching the policy.
 */
public interface BreachedPasswords {

    boolean contains(String password);
}
