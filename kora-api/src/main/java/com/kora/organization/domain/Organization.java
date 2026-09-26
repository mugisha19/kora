package com.kora.organization.domain;

import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.PlatformErrorCodes;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Currency;
import java.util.Objects;
import java.util.UUID;

/**
 * A tenant: one company or public body using Kora. Its id is the tenant id every other tenant-owned row carries. The
 * currency applies to every budget and cost in the organization; the time zone to deadlines and reports.
 */
@Entity
@Table(name = "organizations")
public class Organization {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String slug;

    @Column(nullable = false)
    private String currency;

    @Column(name = "time_zone", nullable = false)
    private String timeZone;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Version
    private Long version;

    protected Organization() {
        // for JPA
    }

    public static Organization create(
            UUID id, String name, String slug, String currency, String timeZone, Instant now) {
        Organization organization = new Organization();
        organization.id = Objects.requireNonNull(id);
        organization.slug = Objects.requireNonNull(slug);
        organization.createdAt = Objects.requireNonNull(now);
        organization.rename(name);
        organization.changeCurrency(currency);
        organization.changeTimeZone(timeZone);
        return organization;
    }

    public void rename(String newName) {
        String trimmed = Objects.requireNonNull(newName).strip();
        if (trimmed.length() < 2 || trimmed.length() > 100) {
            throw invalid("name", PlatformErrorCodes.Field.LENGTH, "size must be between 2 and 100");
        }
        this.name = trimmed;
    }

    /** ISO 4217 code known to the JDK, e.g. {@code RWF}. */
    public void changeCurrency(String newCurrency) {
        try {
            this.currency =
                    Currency.getInstance(Objects.requireNonNull(newCurrency)).getCurrencyCode();
        } catch (IllegalArgumentException unknown) {
            throw invalid("currency", PlatformErrorCodes.Field.INVALID, "must be an ISO 4217 currency code");
        }
    }

    /** IANA region id such as {@code Africa/Kigali}; fixed offsets aren't accepted because they ignore DST rules. */
    public void changeTimeZone(String newTimeZone) {
        if (newTimeZone == null || !ZoneId.getAvailableZoneIds().contains(newTimeZone)) {
            throw invalid(
                    "timeZone", PlatformErrorCodes.Field.INVALID, "must be an IANA time zone such as Africa/Kigali");
        }
        this.timeZone = newTimeZone;
    }

    private static InvalidInputException invalid(String field, String code, String message) {
        return new InvalidInputException(FieldViolation.of(field, code, message));
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getSlug() {
        return slug;
    }

    public String getCurrency() {
        return currency;
    }

    public String getTimeZone() {
        return timeZone;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public long getVersion() {
        return version == null ? 0 : version;
    }
}
