import { LiveAnnouncer } from '@angular/cdk/a11y';
import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { OrgClock } from '../../core/session/org-clock';
import { isoWeekOf, shiftWeek } from '../../shared/format/iso-week';
import { ConfirmDialogService } from '../../shared/ui/confirm-dialog';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { PageHeader } from '../../shared/ui/page-header';
import { StatusChip } from '../../shared/ui/status-chip';
import { AddTaskDialog, AddTaskDialogData } from './add-task-dialog';
import { formatHours } from '../../shared/format/hours';
import { SHEET_LOOK } from '../../shared/ui/time-look';
import { NewRow, TimesheetStore } from './timesheet.store';

/**
 * `/timesheets` and `/timesheets/<week>` (feature 15): my week as a grid of tasks × days, filled
 * with the keyboard (arrow keys and Enter move between cells), saved as a draft while I type and
 * submitted to each project's managers. Submitted and approved projects are read-only.
 */
@Component({
  selector: 'kora-timesheet-page',
  imports: [
    ErrorState,
    LoadingState,
    MatButton,
    MatIcon,
    MatIconButton,
    MatTooltip,
    PageHeader,
    StatusChip,
    TranslocoPipe,
  ],
  providers: [TimesheetStore],
  templateUrl: './timesheet-page.html',
  styleUrl: './timesheet-page.scss',
})
export class TimesheetPage {
  /** Route parameter, e.g. 2026-W40; absent for the current week. */
  readonly week = input<string>();

  protected readonly store = inject(TimesheetStore);
  protected readonly language = inject(LanguageService);
  protected readonly look = SHEET_LOOK;
  private readonly clock = inject(OrgClock);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly transloco = inject(TranslocoService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  protected readonly currentWeek = computed(() => this.week() ?? isoWeekOf(this.clock.today()));
  protected readonly isThisWeek = computed(
    () => this.currentWeek() === isoWeekOf(this.clock.today()),
  );
  /** "28 Sep – 4 Oct 2026" in the UI language. */
  protected readonly range = computed(() => {
    const days = this.store.days();
    if (!days.length) return '';
    const format = new Intl.DateTimeFormat(this.language.current(), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    return format.formatRange(new Date(days[0]), new Date(days[6]));
  });
  protected readonly dayLabels = computed(() => {
    const weekday = new Intl.DateTimeFormat(this.language.current(), {
      weekday: 'short',
      timeZone: 'UTC',
    });
    const long = new Intl.DateTimeFormat(this.language.current(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
    return this.store.days().map((d) => ({
      short: weekday.format(new Date(d)),
      day: Number(d.slice(8)),
      long: long.format(new Date(d)),
      weekend: [5, 6].includes(this.store.days().indexOf(d)),
    }));
  });
  protected readonly rejected = computed(() =>
    (this.store.data()?.sheets ?? []).filter((s) => s.status === 'REJECTED'),
  );

  constructor() {
    effect(() => {
      const week = this.currentWeek();
      untracked(() => void this.store.load(week));
    });
  }

  protected hours(value: number): string {
    return formatHours(value, this.language.current()) || '0';
  }

  protected go(offset: number): void {
    const week =
      offset === 0 ? isoWeekOf(this.clock.today()) : shiftWeek(this.currentWeek(), offset);
    void this.router.navigate(['/timesheets', week]);
  }

  protected onInput(row: number, day: number, event: Event): void {
    this.store.setCell(row, day, (event.target as HTMLInputElement).value);
  }

  /** Spreadsheet keys: arrows move between cells, Enter moves down. */
  protected onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const cell = target.dataset['cell'];
    if (!cell) return;
    const [row, day] = cell.split('-').map(Number);
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      Enter: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (!move) return;
    const next = this.host.nativeElement.querySelector<HTMLInputElement>(
      `[data-cell="${row + move[0]}-${day + move[1]}"]`,
    );
    if (next) {
      event.preventDefault();
      next.focus();
      next.select();
    }
  }

  protected async addTask(): Promise<void> {
    const row = await firstValueFrom(
      this.dialog
        .open<AddTaskDialog, AddTaskDialogData, NewRow>(AddTaskDialog, {
          data: { present: this.store.rows().flatMap((r) => (r.taskId ? [r.taskId] : [])) },
        })
        .afterClosed(),
    );
    if (!row) return;
    this.store.addRows([row]);
    this.focusRow(row.taskId);
  }

  protected async copyLastWeek(): Promise<void> {
    const added = await this.store.copyLastWeek();
    void this.announcer.announce(this.transloco.translate('timesheets.copied', { count: added }));
  }

  protected async submit(): Promise<void> {
    const confirmed = await firstValueFrom(
      this.confirmDialog.confirm({
        title: this.transloco.translate('timesheets.submitTitle'),
        message: this.transloco.translate('timesheets.submitMessage', {
          hours: this.hours(this.store.weekTotal()),
        }),
        confirmLabel: this.transloco.translate('timesheets.submit'),
      }),
    );
    if (confirmed && (await this.store.submit())) {
      void this.announcer.announce(this.transloco.translate('timesheets.submitted'));
    }
  }

  private focusRow(taskId: string): void {
    afterNextRender(
      () => {
        const index = this.store.rows().findIndex((r) => r.taskId === taskId);
        this.host.nativeElement
          .querySelector<HTMLInputElement>(`[data-cell="${index}-0"]`)
          ?.focus();
      },
      { injector: this.injector },
    );
  }
}
