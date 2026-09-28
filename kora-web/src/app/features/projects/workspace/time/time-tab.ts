import { Component, computed, inject, input, linkedSignal, resource, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatOption, MatSelect, MatSelectTrigger } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../../../core/api/api-error';
import { TIMESHEET_STATUSES, TimesheetStatus } from '../../../../core/api/api.models';
import { ResourcesApi } from '../../../../core/api/resources.api';
import { TimesheetsApi } from '../../../../core/api/timesheets.api';
import { ErrorMessages } from '../../../../core/errors/error-messages';
import { LanguageService } from '../../../../core/i18n/language.service';
import { OrgClock } from '../../../../core/session/org-clock';
import { isoWeekOf, mondayOf, plusDays } from '../../../../shared/format/iso-week';
import { QueryParams, oneOfParam } from '../../../../shared/routing/query-params';
import { EmptyState } from '../../../../shared/ui/empty-state';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { StatusChip } from '../../../../shared/ui/status-chip';
import { formatHours, parseWeeklyHours } from '../../../../shared/format/hours';
import { BAND_ICON, SHEET_LOOK } from '../../../../shared/ui/time-look';
import { ProjectStore } from '../project.store';
import { TimeFacade } from './time.facade';

/** A week above this many hours on one project is flagged for the approver. */
export const LONG_WEEK_HOURS = 50;
const PLAN_WEEKS = 8;

/**
 * Time tab (features 15–16): the project's timesheets for its managers to approve (a long week is
 * flagged), and the team's planned hours for the coming weeks. Planned hours are edited locally
 * with a what-if preview of each person's utilization across all their projects, then saved.
 */
@Component({
  selector: 'kora-time-tab',
  imports: [
    EmptyState,
    ErrorState,
    LoadingState,
    MatButton,
    MatFormField,
    MatIcon,
    MatLabel,
    MatOption,
    MatSelect,
    MatSelectTrigger,
    RouterLink,
    StatusChip,
    TranslocoPipe,
  ],
  providers: [TimeFacade, QueryParams],
  templateUrl: './time-tab.html',
  styleUrl: './time-tab.scss',
})
export class TimeTab {
  /** Query parameter: the approval list's status filter. */
  readonly status = input<string>();

  protected readonly project = inject(ProjectStore);
  protected readonly facade = inject(TimeFacade);
  protected readonly query = inject(QueryParams);
  protected readonly language = inject(LanguageService);
  private readonly timesheets = inject(TimesheetsApi);
  private readonly resources = inject(ResourcesApi);
  private readonly clock = inject(OrgClock);
  private readonly messages = inject(ErrorMessages);
  private readonly transloco = inject(TranslocoService);

  protected readonly statuses = TIMESHEET_STATUSES;
  protected readonly look = SHEET_LOOK;
  protected readonly bandIcons = BAND_ICON;
  protected readonly longWeek = LONG_WEEK_HOURS;
  protected readonly statusFilter = computed<TimesheetStatus | null>(() =>
    this.status() === 'all' ? null : (oneOfParam(this.status(), TIMESHEET_STATUSES) ?? 'SUBMITTED'),
  );
  private readonly projectId = computed(() => this.project.projectId() ?? '');

  protected readonly sheets = resource({
    params: () =>
      this.project.canEdit()
        ? { id: this.projectId(), status: this.statusFilter(), version: this.facade.version() }
        : undefined,
    loader: ({ params }) =>
      firstValueFrom(
        this.timesheets.forProject(params.id, {
          ...(params.status ? { status: params.status } : {}),
          size: 50,
        }),
      ),
  });

  // ---------- Planned hours ----------

  protected readonly weeks = computed(() => {
    const monday = mondayOf(this.clock.today());
    return Array.from({ length: PLAN_WEEKS }, (_, i) => plusDays(monday, i * 7));
  });
  protected readonly weekLabels = computed(() => {
    const format = new Intl.DateTimeFormat(this.language.current(), {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
    return this.weeks().map((w) => format.format(new Date(w)));
  });
  /** The team: the manager and contributors (the people who can log time here). */
  protected readonly team = computed(() =>
    (this.project.members() ?? []).filter(
      (m) => m.projectRole === 'MANAGER' || m.projectRole === 'CONTRIBUTOR',
    ),
  );

  protected readonly allocations = resource({
    params: () => ({ id: this.projectId(), version: this.facade.version() }),
    loader: ({ params }) =>
      firstValueFrom(
        this.resources.allocations(params.id, {
          from: this.weeks()[0],
          to: this.weeks()[PLAN_WEEKS - 1],
        }),
      ),
  });
  protected readonly heatmap = resource({
    params: () => ({ id: this.projectId(), version: this.facade.version() }),
    loader: ({ params }) =>
      firstValueFrom(
        this.resources.heatmap({
          from: this.weeks()[0],
          to: this.weeks()[PLAN_WEEKS - 1],
          projectId: params.id,
        }),
      ),
  });

  /** Saved hours on this project, by "userId|weekStart". */
  private readonly saved = computed(() => {
    const map = new Map<string, number>();
    for (const a of this.allocations.value() ?? [])
      map.set(`${a.user.userId}|${a.weekStart}`, a.hours);
    return map;
  });
  /** What the editor shows: saved hours, then local edits (what-if). */
  protected readonly draft = linkedSignal<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const [key, hours] of this.saved())
      map.set(key, formatHours(hours, this.language.current()));
    return map;
  });
  protected readonly edited = computed(() =>
    [...this.draft().entries()].filter(
      ([key, text]) => parseWeeklyHours(text) !== (this.saved().get(key) ?? 0),
    ),
  );
  protected readonly planError = signal<string | null>(null);
  protected readonly planSaving = signal(false);

  protected cell(userId: string, week: string): string {
    return this.draft().get(`${userId}|${week}`) ?? '';
  }

  protected invalid(userId: string, week: string): boolean {
    return parseWeeklyHours(this.cell(userId, week)) === null;
  }

  protected setCell(userId: string, week: string, event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.draft.update((map) => new Map(map).set(`${userId}|${week}`, text));
  }

  /** Utilization if the draft were saved: other projects' hours plus this project's draft. */
  protected preview(userId: string, week: string) {
    const person = this.heatmap.value()?.people.find((p) => p.user.userId === userId);
    const cell = person?.weeks.find((w) => w.weekStart === week);
    if (!cell || !cell.capacityHours) return null;
    const key = `${userId}|${week}`;
    const draftHours = parseWeeklyHours(this.cell(userId, week));
    if (draftHours === null) return null;
    const allocated = cell.allocatedHours - (this.saved().get(key) ?? 0) + draftHours;
    const utilization = Math.round((allocated / cell.capacityHours) * 1000) / 10;
    const band = utilization < 70 ? 'UNDER' : utilization <= 100 ? 'HEALTHY' : 'OVER';
    return {
      percent: new Intl.NumberFormat(this.language.current(), {
        style: 'percent',
        maximumFractionDigits: 0,
      }).format(utilization / 100),
      band: band as 'UNDER' | 'HEALTHY' | 'OVER',
      changed: allocated !== cell.allocatedHours,
    };
  }

  protected discard(): void {
    this.draft.set(
      new Map([...this.saved()].map(([k, h]) => [k, formatHours(h, this.language.current())])),
    );
    this.planError.set(null);
  }

  protected async savePlan(): Promise<void> {
    if (this.team().some((m) => this.weeks().some((w) => this.invalid(m.userId, w)))) {
      this.planError.set(this.transloco.translate('time.errors.hours'));
      return;
    }
    this.planSaving.set(true);
    this.planError.set(null);
    try {
      await this.facade.saveAllocations(
        this.edited().map(([key, text]) => {
          const [userId, weekStart] = key.split('|');
          return { userId, weekStart, hours: parseWeeklyHours(text) ?? 0 };
        }),
      );
    } catch (error: unknown) {
      this.planError.set(this.messages.message(toApiError(error)));
    } finally {
      this.planSaving.set(false);
    }
  }

  protected weekNumber(weekStart: string): string {
    return isoWeekOf(weekStart).slice(6);
  }

  protected hours(value: number): string {
    return formatHours(value, this.language.current()) || '0';
  }
}
