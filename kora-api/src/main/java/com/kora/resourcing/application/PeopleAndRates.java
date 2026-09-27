package com.kora.resourcing.application;

import com.kora.organization.ActiveMember;
import com.kora.organization.CurrentMember;
import com.kora.organization.MemberDirectory;
import com.kora.organization.MemberSummary;
import com.kora.organization.OrganizationCurrency;
import com.kora.organization.OrganizationTimeZone;
import com.kora.organization.Role;
import com.kora.platform.error.FieldViolation;
import com.kora.platform.error.InvalidInputException;
import com.kora.platform.error.NotFoundException;
import com.kora.platform.error.PlatformErrorCodes;
import com.kora.platform.money.Money;
import com.kora.resourcing.domain.CapacityPeriod;
import com.kora.resourcing.domain.CostRate;
import com.kora.resourcing.domain.Leave;
import com.kora.resourcing.domain.WeeklyCapacity;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * People's cost rates (feature 15), weekly capacity and leave (feature 16). Rates are confidential: only
 * {@code ORG_ADMIN} and {@code PMO} see them. Capacity is visible to the person and to those who plan work.
 */
@Service
public class PeopleAndRates {

    private final CostRateRepository rates;
    private final CapacityRepository capacities;
    private final LeaveRepository leave;
    private final MemberDirectory members;
    private final OrganizationCurrency currency;
    private final OrganizationTimeZone timeZone;
    private final Clock clock;

    PeopleAndRates(
            CostRateRepository rates,
            CapacityRepository capacities,
            LeaveRepository leave,
            MemberDirectory members,
            OrganizationCurrency currency,
            OrganizationTimeZone timeZone,
            Clock clock) {
        this.rates = rates;
        this.capacities = capacities;
        this.leave = leave;
        this.members = members;
        this.currency = currency;
        this.timeZone = timeZone;
        this.clock = clock;
    }

    /** Hours per week valid today, the history newest first, and the person's leave. */
    public record Capacity(UUID userId, BigDecimal hoursPerWeek, List<CapacityPeriod> history, List<Leave> leave) {}

    @Transactional(readOnly = true)
    public List<CostRate> rates(UUID userId) {
        CurrentMember.requireRole(Role.ORG_ADMIN, Role.PMO);
        requireMember(userId);
        return rates.findByUserIdOrderByValidFromDesc(userId);
    }

    /** A second rate from the same day corrects the first. */
    @Transactional
    public CostRate addRate(UUID userId, Money hourlyRate, LocalDate validFrom) {
        ActiveMember caller = CurrentMember.requireRole(Role.ORG_ADMIN, Role.PMO);
        requireMember(userId);
        if (!hourlyRate.currency().equals(currency.current())) {
            throw new InvalidInputException(FieldViolation.of(
                    "hourlyRate.currency",
                    PlatformErrorCodes.Field.INVALID,
                    "must be the organization's currency, " + currency.current()));
        }
        if (hourlyRate.isNegative()) {
            throw new InvalidInputException(
                    FieldViolation.of("hourlyRate.amount", PlatformErrorCodes.Field.RANGE, "must not be negative"));
        }
        CostRate rate = rates.findByUserIdAndValidFrom(userId, validFrom)
                .map(existing -> {
                    existing.change(hourlyRate, clock.instant());
                    return existing;
                })
                .orElseGet(
                        () -> CostRate.from(caller.organizationId(), userId, hourlyRate, validFrom, clock.instant()));
        return rates.saveAndFlush(rate);
    }

    @Transactional(readOnly = true)
    public Capacity capacity(UUID userId) {
        ActiveMember caller = CurrentMember.get();
        if (!caller.userId().equals(userId)) {
            CurrentMember.requireRole(Role.ORG_ADMIN, Role.PMO, Role.PROJECT_MANAGER);
        }
        requireMember(userId);
        List<CapacityPeriod> history = capacities.findByUserIdOrderByValidFromDesc(userId);
        return new Capacity(
                userId,
                WeeklyCapacity.hoursPerWeekOn(LocalDate.now(clock.withZone(timeZone.zone())), history),
                history,
                leave.findByUserIdOrderByFromAsc(userId));
    }

    @Transactional
    public Capacity changeCapacity(UUID userId, BigDecimal hoursPerWeek, LocalDate validFrom) {
        ActiveMember caller = CurrentMember.requireRole(Role.ORG_ADMIN, Role.PMO);
        requireMember(userId);
        CapacityPeriod period = capacities
                .findByUserIdAndValidFrom(userId, validFrom)
                .orElseGet(() -> CapacityPeriod.from(caller.organizationId(), userId, hoursPerWeek, validFrom));
        period.change(hoursPerWeek);
        capacities.save(period);
        return capacity(userId);
    }

    /** The person, or someone who plans work for everyone. */
    @Transactional
    public Leave addLeave(UUID userId, LocalDate from, LocalDate to, String reason) {
        requireSelfOrPlanner(userId);
        requireMember(userId);
        return leave.save(Leave.of(CurrentMember.get().organizationId(), userId, from, to, reason));
    }

    @Transactional
    public void deleteLeave(UUID leaveId) {
        Leave away = leave.findById(leaveId).orElseThrow(() -> NotFoundException.of("Leave", leaveId));
        requireSelfOrPlanner(away.getUserId());
        leave.delete(away);
    }

    private static void requireSelfOrPlanner(UUID userId) {
        if (!CurrentMember.get().userId().equals(userId)) {
            CurrentMember.requireRole(Role.ORG_ADMIN, Role.PMO);
        }
    }

    private MemberSummary requireMember(UUID userId) {
        return members.find(userId).orElseThrow(() -> NotFoundException.of("Member", userId));
    }
}
