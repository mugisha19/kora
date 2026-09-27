package com.kora.identity.application;

import com.kora.identity.IssuedSession;
import com.kora.identity.UserAccounts;
import com.kora.identity.domain.EmailAddresses;
import com.kora.platform.audit.AuditRecord;
import com.kora.platform.audit.AuditTrail;
import com.kora.platform.error.ProblemException;
import com.kora.platform.metrics.BusinessMetrics;
import com.kora.platform.ratelimit.RateLimiter;
import com.kora.platform.ratelimit.RateLimits;
import java.util.UUID;
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
    private final AuditTrail audit;
    private final BusinessMetrics metrics;

    LoginService(
            UserAccounts accounts,
            SessionService sessions,
            RateLimiter rateLimiter,
            RateLimits limits,
            AuditTrail audit,
            BusinessMetrics metrics) {
        this.metrics = metrics;
        this.accounts = accounts;
        this.sessions = sessions;
        this.rateLimiter = rateLimiter;
        this.limits = limits;
        this.audit = audit;
    }

    public IssuedSession login(String email, String password, String clientAddress) {
        rateLimiter.acquire(limits.named("login-ip", "20/1m"), clientAddress);
        rateLimiter.acquire(limits.named("login-email", "10/15m"), EmailAddresses.normalize(email));
        UUID userId;
        try {
            userId = accounts.authenticate(email, password);
        } catch (ProblemException refused) {
            audit.security("auth.sign_in_failed", null, AuditRecord.Outcome.DENIED);
            metrics.signIn(false);
            throw refused;
        }
        audit.security("auth.signed_in", userId, AuditRecord.Outcome.SUCCESS);
        metrics.signIn(true);
        return sessions.start(userId);
    }
}
