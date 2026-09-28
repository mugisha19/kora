import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../core/api/api-error';
import { TimesheetEntryInput, TimesheetWeek } from '../../core/api/api.models';
import { TimesheetsApi } from '../../core/api/timesheets.api';
import { ErrorMessages } from '../../core/errors/error-messages';
import { daysOfWeek, shiftWeek } from '../../shared/format/iso-week';
import { addHours, parseHours } from '../../shared/format/hours';

/** A task's line in the grid: one text cell per day, Monday first. */
export interface TimesheetRow {
  taskId?: string;
  taskKey: string;
  taskTitle: string;
  projectId: string;
  /** Its project's sheet is submitted or approved: read-only. */
  locked: boolean;
  cells: string[];
  /** Kept from the loaded entries so a save doesn't drop them. */
  notes: (string | undefined)[];
  billable: boolean[];
}

export interface NewRow {
  taskId: string;
  taskKey: string;
  taskTitle: string;
  projectId: string;
}

/** How long typing pauses before the draft saves. */
export const AUTOSAVE_MS = 800;
const LOCKED = new Set(['SUBMITTED', 'APPROVED']);

/**
 * One week of my time (feature 15), provided by the timesheet page: the week's entries as a grid
 * of tasks × days, edited locally and saved as a draft shortly after typing stops. Invalid cells
 * and days above 24 h aren't sent; submitting saves first.
 */
@Injectable()
export class TimesheetStore {
  private readonly api = inject(TimesheetsApi);
  private readonly messages = inject(ErrorMessages);
  private readonly transloco = inject(TranslocoService);

  readonly week = signal<string>('');
  readonly data = signal<TimesheetWeek | null>(null);
  readonly rows = signal<TimesheetRow[]>([]);
  readonly status = signal<'loading' | 'ready' | 'error'>('loading');
  readonly loadError = signal<ApiError | null>(null);
  readonly saveState = signal<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  readonly saveError = signal<string | null>(null);
  readonly submitting = signal(false);

  readonly days = computed(() => (this.week() ? daysOfWeek(this.week()) : []));
  readonly editable = computed(() => this.data()?.editable ?? false);
  /** Hours per cell, null where the text isn't valid. */
  readonly parsed = computed(() => this.rows().map((r) => r.cells.map(parseHours)));
  readonly rowTotals = computed(() =>
    this.parsed().map((cells) => addHours(cells.map((h) => h ?? 0))),
  );
  readonly dayTotals = computed(() =>
    this.days().map((_, d) => addHours(this.parsed().map((cells) => cells[d] ?? 0))),
  );
  readonly weekTotal = computed(() => addHours(this.dayTotals()));
  readonly invalidCells = computed(() =>
    this.parsed().flatMap((cells, r) => cells.flatMap((h, d) => (h === null ? [`${r}-${d}`] : []))),
  );
  /** Days above 24 h, by index. */
  readonly overDays = computed(() =>
    this.dayTotals().flatMap((hours, d) => (hours > 24 ? [d] : [])),
  );
  readonly canSave = computed(() => !this.invalidCells().length && !this.overDays().length);
  /** Open sheets with hours can be submitted. */
  readonly canSubmit = computed(() =>
    this.rows().some((r, i) => !r.locked && this.rowTotals()[i] > 0),
  );

  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped by every edit: a save only overwrites the grid if nothing changed meanwhile. */
  private edits = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this.timer) {
        clearTimeout(this.timer);
        // Leaving with a pending draft: save it anyway.
        void this.save();
      }
    });
  }

  async load(week: string): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
      await this.save();
    }
    this.week.set(week);
    this.status.set('loading');
    this.saveState.set('idle');
    this.saveError.set(null);
    try {
      this.apply(await firstValueFrom(this.api.week(week)));
      this.status.set('ready');
    } catch (error: unknown) {
      this.loadError.set(toApiError(error));
      this.status.set('error');
    }
  }

  setCell(row: number, day: number, text: string): void {
    this.rows.update((rows) =>
      rows.map((r, i) =>
        i === row ? { ...r, cells: r.cells.map((c, d) => (d === day ? text : c)) } : r,
      ),
    );
    this.changed();
  }

  addRows(rows: readonly NewRow[]): number {
    const present = new Set(this.rows().map((r) => r.taskId));
    const fresh = rows.filter((r) => !present.has(r.taskId));
    this.rows.update((current) => [
      ...current,
      ...fresh.map((r) => ({
        ...r,
        locked: false,
        cells: Array(7).fill(''),
        notes: Array(7).fill(undefined),
        billable: Array(7).fill(false),
      })),
    ]);
    return fresh.length;
  }

  removeRow(row: number): void {
    this.rows.update((rows) => rows.filter((_, i) => i !== row));
    this.changed();
  }

  /** The tasks I logged last week, as empty rows; resolves with how many were added. */
  async copyLastWeek(): Promise<number> {
    const previous = await firstValueFrom(this.api.week(shiftWeek(this.week(), -1)));
    const tasks = new Map<string, NewRow>();
    for (const e of previous.entries) {
      if (e.taskId) {
        tasks.set(e.taskId, {
          taskId: e.taskId,
          taskKey: e.taskKey,
          taskTitle: e.taskTitle,
          projectId: e.projectId,
        });
      }
    }
    return this.addRows([...tasks.values()].sort((a, b) => a.taskKey.localeCompare(b.taskKey)));
  }

  /** Saves now if a draft is waiting, then submits the week. */
  async submit(): Promise<boolean> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (!this.canSave()) return false;
    this.submitting.set(true);
    try {
      if (!(await this.save())) return false;
      this.apply(await firstValueFrom(this.api.submit(this.week())));
      return true;
    } catch (error: unknown) {
      this.saveError.set(this.explain(toApiError(error)));
      return false;
    } finally {
      this.submitting.set(false);
    }
  }

  /** Resolves true when the week is saved (or had nothing to save). */
  async save(): Promise<boolean> {
    this.timer = undefined;
    if (!this.canSave()) return false;
    const edits = this.edits;
    this.saveState.set('saving');
    this.saveError.set(null);
    try {
      const week = await firstValueFrom(this.api.saveEntries(this.week(), this.entries()));
      // Typing continued meanwhile: keep the grid, take the week's new status.
      if (edits === this.edits) this.apply(week);
      else this.data.set(week);
      this.saveState.set('saved');
      return true;
    } catch (error: unknown) {
      this.saveState.set('error');
      this.saveError.set(this.explain(toApiError(error)));
      return false;
    }
  }

  private changed(): void {
    this.edits += 1;
    this.saveError.set(null);
    if (this.timer) clearTimeout(this.timer);
    if (!this.canSave()) {
      this.saveState.set('idle');
      return;
    }
    this.saveState.set('pending');
    this.timer = setTimeout(() => void this.save(), AUTOSAVE_MS);
  }

  /** Every entry of the week: locked ones as they were, the rest from the grid. */
  private entries(): TimesheetEntryInput[] {
    const days = this.days();
    const locked = (this.data()?.entries ?? [])
      .filter((e) => e.taskId && this.rows().some((r) => r.locked && r.projectId === e.projectId))
      .map((e) => ({
        taskId: e.taskId as string,
        date: e.date,
        hours: e.hours,
        ...(e.note ? { note: e.note } : {}),
        billable: e.billable,
      }));
    const open = this.rows().flatMap((row, r) =>
      row.locked || !row.taskId
        ? []
        : row.cells.flatMap((_, d) => {
            const hours = this.parsed()[r][d] ?? 0;
            return hours > 0
              ? [
                  {
                    taskId: row.taskId as string,
                    date: days[d],
                    hours,
                    ...(row.notes[d] ? { note: row.notes[d] } : {}),
                    billable: row.billable[d],
                  },
                ]
              : [];
          }),
    );
    return [...locked, ...open];
  }

  private apply(week: TimesheetWeek): void {
    this.data.set(week);
    const days = daysOfWeek(week.week);
    const lockedProjects = new Set(
      week.sheets.filter((s) => LOCKED.has(s.status)).map((s) => s.projectId),
    );
    const rows = new Map<string, TimesheetRow>();
    for (const e of week.entries) {
      const key = e.taskId ?? e.taskKey;
      const row = rows.get(key) ?? {
        ...(e.taskId ? { taskId: e.taskId } : {}),
        taskKey: e.taskKey,
        taskTitle: e.taskTitle,
        projectId: e.projectId,
        locked: !week.editable || lockedProjects.has(e.projectId) || !e.taskId,
        cells: Array(7).fill(''),
        notes: Array(7).fill(undefined),
        billable: Array(7).fill(false),
      };
      const d = days.indexOf(e.date);
      if (d >= 0) {
        const hours = addHours([parseHours(row.cells[d]) ?? 0, e.hours]);
        row.cells[d] = this.format(hours);
        row.notes[d] = row.notes[d] ?? e.note;
        row.billable[d] = row.billable[d] || e.billable;
      }
      rows.set(key, row);
    }
    // Rows added but not yet logged stay in the grid.
    const kept = this.rows().filter(
      (r) => !r.locked && r.taskId && !rows.has(r.taskId) && this.week() === week.week,
    );
    this.rows.set([...rows.values(), ...kept].sort((a, b) => a.taskKey.localeCompare(b.taskKey)));
  }

  private format(hours: number): string {
    return new Intl.NumberFormat(this.transloco.getActiveLang(), {
      maximumFractionDigits: 2,
      useGrouping: false,
    }).format(hours);
  }

  private explain(error: ApiError): string {
    if (
      error.code === 'validation.failed' &&
      error.fieldErrors.some((e) => e.field === 'entries')
    ) {
      return this.transloco.translate('timesheets.errors.dayOver24');
    }
    if (error.status === 403) return this.transloco.translate('timesheets.errors.notOnTeam');
    return this.messages.message(error);
  }
}
