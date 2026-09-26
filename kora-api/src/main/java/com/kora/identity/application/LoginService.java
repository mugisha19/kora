package com.kora.identity.application;

import com.kora.identity.IssuedSession;
import com.kora.identity.UserAccounts;
import com.kora.identity.domain.EmailAddresses;
import com.kora.platform.ratelimit.RateLimiter;
import com.kora.platform.ratelimit.RateLimits;
import org.springframework.stereotype.Service;

/**
 * Signing in with email and password. Rate-limited twice: per IP address (one machine guessing many accounts) and
 * per email (many machines guessing one account), before any password work is done.
 */
@Service
public class LoginService {

    private final UserAccounts accounts;
    private final SessionService sessions;
    private final RateLimiter rateLimiter;
    private final RateLimits limits;

    LoginService(UserAccounts accounts, SessionService sessions, RateLimiter rateLimiter, RateLimits limits) {
        this.accounts = accounts;
        this.sessions = sessions;
        this.rateLimiter = rateLimiter;
        this.limits = limits;
    }

    public IssuedSession login(String email, String password, String clientAddress) {
        rateLimiter.acquire(limits.named("login-ip", "20/1m"), clientAddress);
        rateLimiter.acquire(limits.named("login-email", "10/15m"), EmailAddresses.normalize(email));
        return sessions.start(accounts.authenticate(email, password));
    }
}
