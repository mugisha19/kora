package com.kora.schedule.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.kora.schedule.domain.SchedulingStrategy.Activity;
import com.kora.schedule.domain.SchedulingStrategy.Link;
import com.kora.schedule.domain.SchedulingStrategy.Schedule;
import com.kora.schedule.domain.SchedulingStrategy.Timing;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Feature 10: the critical path method against networks worked out by hand. */
class CriticalPathMethodTest {

    private final SchedulingStrategy cpm = new CriticalPathMethod();
    private final List<Activity> activities = new ArrayList<>();
    private final List<Link> links = new ArrayList<>();

    /**
     * The textbook network: A(3) → B(4) → D(5) → E(1), and A → C(2) → D. Critical path A-B-D-E, 13 days; C can slip
     * 2 days.
     */
    @Test
    void solvesTheTextbookNetwork() {
        UUID a = activity(3);
        UUID b = activity(4);
        UUID c = activity(2);
        UUID d = activity(5);
        UUID e = activity(1);
        link(a, b, DependencyType.FS, 0);
        link(a, c, DependencyType.FS, 0);
        link(b, d, DependencyType.FS, 0);
        link(c, d, DependencyType.FS, 0);
        link(d, e, DependencyType.FS, 0);

        Schedule schedule = cpm.schedule(activities, links);

        assertThat(schedule.finish()).isEqualTo(13);
        assertThat(schedule.timings().get(a)).isEqualTo(new Timing(0, 3, 0, 3, 0, 0));
        assertThat(schedule.timings().get(b)).isEqualTo(new Timing(3, 7, 3, 7, 0, 0));
        assertThat(schedule.timings().get(c)).isEqualTo(new Timing(3, 5, 5, 7, 2, 2));
        assertThat(schedule.timings().get(d)).isEqualTo(new Timing(7, 12, 7, 12, 0, 0));
        assertThat(schedule.timings().get(e)).isEqualTo(new Timing(12, 13, 12, 13, 0, 0));
        assertThat(schedule.order()).containsExactly(a, b, c, d, e);
        assertThat(schedule.order().stream()
                        .filter(id -> schedule.timings().get(id).critical()))
                .containsExactly(a, b, d, e);
    }

    @Test
    void appliesAllFourLinkTypesWithLagsAndLeads() {
        UUID p = activity(5);
        UUID ss = activity(4);
        UUID ff = activity(3);
        UUID sf = activity(2);
        UUID lead = activity(2);
        link(p, ss, DependencyType.SS, 2);
        link(p, ff, DependencyType.FF, 1);
        link(p, sf, DependencyType.SF, 1);
        link(p, lead, DependencyType.FS, -2);

        Schedule schedule = cpm.schedule(activities, links);

        assertThat(schedule.finish()).isEqualTo(6);
        assertThat(schedule.timings().get(ss)).isEqualTo(new Timing(2, 6, 2, 6, 0, 0));
        assertThat(schedule.timings().get(ff)).isEqualTo(new Timing(3, 6, 3, 6, 0, 0));
        // SF: it must finish on or after day 1, which it does starting on day 0
        assertThat(schedule.timings().get(sf)).isEqualTo(new Timing(0, 2, 4, 6, 4, 4));
        assertThat(schedule.timings().get(lead)).isEqualTo(new Timing(3, 5, 4, 6, 1, 1));
        assertThat(schedule.timings().get(p)).isEqualTo(new Timing(0, 5, 0, 5, 0, 0));
    }

    @Test
    void freeFloatIsTheSlackBeforeTheFirstSuccessorMoves() {
        UUID a = activity(2);
        UUID b = activity(2);
        UUID c = activity(6);
        UUID d = activity(1);
        link(a, b, DependencyType.FS, 0);
        link(b, d, DependencyType.FS, 0);
        link(c, d, DependencyType.FS, 0);

        Schedule schedule = cpm.schedule(activities, links);

        // A and B share 2 days of total float, but only B can use it without moving anything else.
        assertThat(schedule.timings().get(a).totalFloat()).isEqualTo(2);
        assertThat(schedule.timings().get(a).freeFloat()).isZero();
        assertThat(schedule.timings().get(b).totalFloat()).isEqualTo(2);
        assertThat(schedule.timings().get(b).freeFloat()).isEqualTo(2);
    }

    @Test
    void aStartNoEarlierThanConstraintDelaysTheTaskAndItsSuccessors() {
        UUID delivery = activity(2, 5);
        UUID install = activity(1);
        UUID paperwork = activity(1);
        link(delivery, install, DependencyType.FS, 0);

        Schedule schedule = cpm.schedule(activities, links);

        assertThat(schedule.timings().get(delivery).earlyStart()).isEqualTo(5);
        assertThat(schedule.timings().get(install).earlyStart()).isEqualTo(7);
        assertThat(schedule.timings().get(paperwork).totalFloat()).isEqualTo(7);
        assertThat(schedule.finish()).isEqualTo(8);
    }

    @Test
    void aMilestoneTakesNoTime() {
        UUID work = activity(3);
        UUID milestone = activity(0);
        link(work, milestone, DependencyType.FS, 0);

        Timing timing = cpm.schedule(activities, links).timings().get(milestone);

        assertThat(timing.earlyStart()).isEqualTo(3);
        assertThat(timing.earlyFinish()).isEqualTo(3);
        assertThat(timing.critical()).isTrue();
    }

    @Test
    void refusesALoopAndNamesIt() {
        UUID a = activity(1);
        UUID b = activity(1);
        UUID c = activity(1);
        activity(1);
        link(a, b, DependencyType.FS, 0);
        link(b, c, DependencyType.FS, 0);
        link(c, a, DependencyType.FS, 0);

        assertThatThrownBy(() -> cpm.schedule(activities, links))
                .isInstanceOfSatisfying(CyclicDependencyException.class, error -> {
                    assertThat(error.cycle()).hasSize(4).containsOnly(a, b, c);
                    assertThat(error.cycle().getFirst()).isEqualTo(error.cycle().getLast());
                });
    }

    @Test
    void anEmptyProjectFinishesOnDayZero() {
        assertThat(cpm.schedule(List.of(), List.of()).finish()).isZero();
    }

    @Test
    void findsTheShortestLoopANewLinkWouldClose() {
        UUID a = activity(1);
        UUID b = activity(1);
        UUID c = activity(1);
        link(a, b, DependencyType.FS, 0);
        link(b, c, DependencyType.FS, 0);
        DependencyGraph graph = new DependencyGraph(List.of(a, b, c), links);

        assertThat(graph.loopClosedBy(c, a)).contains(List.of(c, a, b, c));
        assertThat(graph.loopClosedBy(a, c)).isEmpty();
    }

    private UUID activity(int duration) {
        return activity(duration, 0);
    }

    private UUID activity(int duration, int notBefore) {
        UUID id = UUID.randomUUID();
        activities.add(new Activity(id, duration, notBefore));
        return id;
    }

    private void link(UUID predecessor, UUID successor, DependencyType type, int lag) {
        links.add(new Link(predecessor, successor, type, lag));
    }
}
