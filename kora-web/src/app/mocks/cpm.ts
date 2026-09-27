/*
 * The critical path method as the API implements it (feature 10), for the mock. Pure: no database,
 * so the seed can use it too. Days are working-day numbers from the project start (day 0).
 */

export type LinkType = 'FS' | 'SS' | 'FF' | 'SF';

export interface Activity {
  id: string;
  /** Working days; 0 is a milestone. */
  duration: number;
  /** Earliest working day allowed (a START_NO_EARLIER_THAN constraint), 0 otherwise. */
  notBefore: number;
}

export interface Link {
  predecessor: string;
  successor: string;
  type: LinkType;
  lag: number;
}

export interface Timing {
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  totalFloat: number;
  freeFloat: number;
  critical: boolean;
}

export interface CpmResult {
  timings: Map<string, Timing>;
  /** Early start, then input order. */
  order: string[];
  /** Exclusive: the day after the last working day of the project. */
  finish: number;
}

/** The loop found in the links, as task ids, first repeated last (A → B → A). */
export class CycleError extends Error {
  constructor(readonly cycle: string[]) {
    super(`Dependency loop: ${cycle.join(' → ')}`);
  }
}

const ISO_DAY = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

const addDays = (isoDate: string, days: number) =>
  new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Numbers the working days from an origin: day 0 is the first working day on or after it. */
export class WorkingDays {
  private readonly dates: string[] = [];

  constructor(
    private readonly workingDays: ReadonlySet<string>,
    private readonly holidays: ReadonlySet<string>,
    origin: string,
  ) {
    this.dates.push(this.onOrAfter(origin));
  }

  isWorkingDay(date: string): boolean {
    const day = ISO_DAY[new Date(`${date}T00:00:00Z`).getUTCDay()];
    return this.workingDays.has(day) && !this.holidays.has(date);
  }

  /** The date of working day `index` (negative indexes show as day 0). */
  date(index: number): string {
    const wanted = Math.max(index, 0);
    while (this.dates.length <= wanted) {
      this.dates.push(this.onOrAfter(addDays(this.dates[this.dates.length - 1], 1)));
    }
    return this.dates[wanted];
  }

  /** The number of the first working day on or after `date` (negative before the origin). */
  index(date: string): number {
    const first = this.dates[0];
    if (date < first) {
      let count = 0;
      for (let day = date; day < first; day = addDays(day, 1)) if (this.isWorkingDay(day)) count++;
      return -count;
    }
    while (this.dates[this.dates.length - 1] < date) this.date(this.dates.length);
    const found = this.dates.findIndex((d) => d >= date);
    return found;
  }

  private onOrAfter(date: string): string {
    let day = date;
    for (let i = 0; !this.isWorkingDay(day); i++) {
      if (i > 366 * 50) throw new Error(`No working day within 50 years of ${date}`);
      day = addDays(day, 1);
    }
    return day;
  }
}

/** Kahn's topological order (ties in input order); a loop throws `CycleError`. */
export function topologicalOrder(ids: readonly string[], links: readonly Link[]): string[] {
  const indegree = new Map(ids.map((id) => [id, 0]));
  const successors = new Map<string, string[]>();
  for (const link of links) {
    indegree.set(link.successor, (indegree.get(link.successor) ?? 0) + 1);
    successors.set(link.predecessor, [...(successors.get(link.predecessor) ?? []), link.successor]);
  }
  const ready = ids.filter((id) => indegree.get(id) === 0);
  const order: string[] = [];
  while (ready.length) {
    const id = ready.shift() as string;
    order.push(id);
    for (const next of successors.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) ready.push(next);
    }
  }
  if (order.length < ids.length) {
    const stuck = new Set(ids.filter((id) => !order.includes(id)));
    throw new CycleError(loopWithin(stuck, links));
  }
  return order;
}

/** Walks forward inside the nodes left over by Kahn until one repeats: that is a loop. */
function loopWithin(stuck: ReadonlySet<string>, links: readonly Link[]): string[] {
  const next = new Map<string, string>();
  for (const link of links) {
    if (stuck.has(link.predecessor) && stuck.has(link.successor) && !next.has(link.predecessor)) {
      next.set(link.predecessor, link.successor);
    }
  }
  const path: string[] = [];
  let node = [...stuck][0];
  while (!path.includes(node)) {
    path.push(node);
    node = next.get(node) as string;
  }
  return [...path.slice(path.indexOf(node)), node];
}

/**
 * The loop a new link `predecessor → successor` would close, or null: a path from the successor
 * back to the predecessor, reported as predecessor → successor → … → predecessor.
 */
export function loopClosedBy(
  links: readonly Link[],
  predecessor: string,
  successor: string,
): string[] | null {
  const successors = new Map<string, string[]>();
  for (const link of links) {
    successors.set(link.predecessor, [...(successors.get(link.predecessor) ?? []), link.successor]);
  }
  const cameFrom = new Map<string, string>();
  const queue = [successor];
  const seen = new Set([successor]);
  while (queue.length) {
    const node = queue.shift() as string;
    if (node === predecessor) {
      const path: string[] = [];
      for (let step: string | undefined = node; step !== undefined; step = cameFrom.get(step)) {
        path.unshift(step);
      }
      return [predecessor, ...path];
    }
    for (const next of successors.get(node) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        cameFrom.set(next, node);
        queue.push(next);
      }
    }
  }
  return null;
}

export function criticalPath(activities: readonly Activity[], links: readonly Link[]): CpmResult {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const inputOrder = new Map(activities.map((a, i) => [a.id, i]));
  const valid = links.filter((l) => byId.has(l.predecessor) && byId.has(l.successor));
  const order = topologicalOrder(
    activities.map((a) => a.id),
    valid,
  );
  const incoming = new Map<string, Link[]>();
  const outgoing = new Map<string, Link[]>();
  for (const link of valid) {
    incoming.set(link.successor, [...(incoming.get(link.successor) ?? []), link]);
    outgoing.set(link.predecessor, [...(outgoing.get(link.predecessor) ?? []), link]);
  }
  const duration = (id: string) => byId.get(id)?.duration ?? 0;

  // Forward pass.
  const earlyStart = new Map<string, number>();
  let finish = 0;
  for (const id of order) {
    let start = Math.max(0, byId.get(id)?.notBefore ?? 0);
    for (const link of incoming.get(id) ?? []) {
      const ps = earlyStart.get(link.predecessor) ?? 0;
      const pf = ps + duration(link.predecessor);
      const d = duration(id);
      const allowed =
        link.type === 'FS'
          ? pf + link.lag
          : link.type === 'SS'
            ? ps + link.lag
            : link.type === 'FF'
              ? pf + link.lag - d
              : ps + link.lag - d;
      start = Math.max(start, allowed);
    }
    earlyStart.set(id, start);
    finish = Math.max(finish, start + duration(id));
  }

  // Backward pass.
  const lateFinish = new Map<string, number>();
  for (const id of [...order].reverse()) {
    let latest = finish;
    for (const link of outgoing.get(id) ?? []) {
      const sf = lateFinish.get(link.successor) ?? finish;
      const ss = sf - duration(link.successor);
      const d = duration(id);
      const allowed =
        link.type === 'FS'
          ? ss - link.lag
          : link.type === 'SS'
            ? ss - link.lag + d
            : link.type === 'FF'
              ? sf - link.lag
              : sf - link.lag + d;
      latest = Math.min(latest, allowed);
    }
    lateFinish.set(id, latest);
  }

  const timings = new Map<string, Timing>();
  for (const id of order) {
    const d = duration(id);
    const es = earlyStart.get(id) ?? 0;
    const lf = lateFinish.get(id) ?? finish;
    const totalFloat = lf - d - es;
    timings.set(id, {
      earlyStart: es,
      earlyFinish: es + d,
      lateStart: lf - d,
      lateFinish: lf,
      totalFloat,
      freeFloat: freeFloat(es, d, outgoing.get(id) ?? [], earlyStart, duration, finish),
      critical: totalFloat === 0,
    });
  }
  const scheduleOrder = [...order].sort(
    (a, b) =>
      (earlyStart.get(a) ?? 0) - (earlyStart.get(b) ?? 0) ||
      (inputOrder.get(a) ?? 0) - (inputOrder.get(b) ?? 0),
  );
  return { timings, order: scheduleOrder, finish };
}

function freeFloat(
  start: number,
  duration: number,
  links: readonly Link[],
  earlyStart: ReadonlyMap<string, number>,
  durationOf: (id: string) => number,
  finish: number,
): number {
  const end = start + duration;
  if (!links.length) return Math.max(0, finish - end);
  let slack = Number.MAX_SAFE_INTEGER;
  for (const link of links) {
    const ss = earlyStart.get(link.successor) ?? 0;
    const sf = ss + durationOf(link.successor);
    const room =
      link.type === 'FS'
        ? ss - link.lag - end
        : link.type === 'SS'
          ? ss - link.lag - start
          : link.type === 'FF'
            ? sf - link.lag - end
            : sf - link.lag - start;
    slack = Math.min(slack, room);
  }
  return Math.max(0, slack);
}
