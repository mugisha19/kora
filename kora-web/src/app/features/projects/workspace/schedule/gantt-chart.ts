import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Dependency, ScheduledTask } from '../../../../core/api/api.models';
import {
  BAR_HEIGHT,
  BarBox,
  CalendarRule,
  HEADER_HEIGHT,
  ROW_HEIGHT,
  Zoom,
  addDays,
  arrowPath,
  barOf,
  isWorkingDay,
  rowCenter,
  ticks,
  timeline,
  workingDaysBetween,
  xOf,
} from './gantt-geometry';
import { GanttLegend } from './gantt-legend';

export interface BarMove {
  task: ScheduledTask;
  /** The new "start no earlier than" date. */
  start: string;
}
export interface BarResize {
  task: ScheduledTask;
  durationDays: number;
}
export interface BarLink {
  predecessor: ScheduledTask;
  successor: ScheduledTask;
}

interface Drag {
  kind: 'move' | 'resize' | 'link';
  row: ScheduledTask;
  index: number;
  startX: number;
  /** Pointer position in chart coordinates. */
  x: number;
  y: number;
}

interface Row {
  task: ScheduledTask;
  index: number;
  bar: BarBox;
  baseline?: BarBox;
}

let nextId = 0;

/**
 * The Gantt chart (feature 10, ADR 0009): custom SVG, no chart library. Bars sit on calendar days
 * with non-working days shaded; critical tasks are hatched and labelled "Critical" in the task
 * list, so colour is never the only cue. Managers drag a bar to move it, its right edge to change
 * its duration, and its dot onto another bar to link them; the table view offers every edit with
 * the keyboard.
 */
@Component({
  selector: 'kora-gantt-chart',
  imports: [GanttLegend, TranslocoPipe],
  templateUrl: './gantt-chart.html',
  styleUrl: './gantt-chart.scss',
  host: {
    '[style.--row-height.px]': 'rowHeight',
    '[style.--header-height.px]': 'headerHeight',
    // The pattern's id is unique per chart; the stylesheet fills critical bars with it.
    '[style.--hatch]': '"url(#" + id + "-hatch)"',
  },
})
export class GanttChart {
  readonly tasks = input.required<readonly ScheduledTask[]>();
  readonly dependencies = input.required<readonly Dependency[]>();
  readonly zoom = input<Zoom>('week');
  readonly rule = input.required<CalendarRule>();
  readonly today = input.required<string>();
  readonly projectStart = input.required<string>();
  readonly locale = input('en');
  readonly editable = input(false);
  /** What the chart shows, for screen readers (the table view has the details). */
  readonly label = input.required<string>();

  readonly opened = output<ScheduledTask>();
  readonly moved = output<BarMove>();
  readonly resized = output<BarResize>();
  readonly linked = output<BarLink>();

  protected readonly rowHeight = ROW_HEIGHT;
  protected readonly headerHeight = HEADER_HEIGHT;
  protected readonly barHeight = BAR_HEIGHT;
  protected readonly id = `gantt-${nextId++}`;

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private readonly svg = viewChild<ElementRef<SVGSVGElement>>('svg');
  protected readonly drag = signal<Drag | null>(null);

  protected readonly line = computed(() =>
    timeline(
      this.tasks().flatMap((t) => [
        { start: t.earlyStart, finish: t.earlyFinish },
        ...(t.baselineStart && t.baselineFinish
          ? [{ start: t.baselineStart, finish: t.baselineFinish }]
          : []),
      ]),
      this.projectStart(),
      this.zoom(),
    ),
  );
  protected readonly height = computed(() => HEADER_HEIGHT + this.tasks().length * ROW_HEIGHT);
  protected readonly header = computed(() => ticks(this.line(), this.zoom(), this.locale()));

  protected readonly rows = computed<Row[]>(() =>
    this.tasks().map((task, index) => {
      const line = this.line();
      const milestone = task.durationDays === 0;
      const bar = barOf(line, { start: task.earlyStart, finish: task.earlyFinish }, milestone);
      const baseline =
        task.baselineStart && task.baselineFinish
          ? barOf(line, { start: task.baselineStart, finish: task.baselineFinish }, milestone)
          : undefined;
      return { task, index, bar, ...(baseline ? { baseline } : {}) };
    }),
  );

  /** Non-working days as shaded columns (too thin to help at month zoom). */
  protected readonly offDays = computed(() => {
    const line = this.line();
    if (this.zoom() === 'month') return [];
    const rule = this.rule();
    const xs: number[] = [];
    for (let i = 0; i < line.days; i++) {
      if (!isWorkingDay(addDays(line.origin, i), rule)) xs.push(i * line.dayWidth);
    }
    return xs;
  });

  protected readonly todayX = computed(() => {
    const x = xOf(this.line(), this.today());
    return x >= 0 && x <= this.line().width ? x + this.line().dayWidth / 2 : null;
  });

  protected readonly arrows = computed(() => {
    const index = new Map(this.rows().map((r) => [r.task.taskId, r]));
    return this.dependencies().flatMap((d) => {
      const from = index.get(d.predecessorId);
      const to = index.get(d.successorId);
      if (!from || !to) return [];
      return [
        {
          id: d.id,
          critical: from.task.critical && to.task.critical,
          path: arrowPath(from.bar, from.index, to.bar, to.index, d.type),
        },
      ];
    });
  });

  /** Whole days the pointer has moved. */
  protected readonly dragDays = computed(() => {
    const drag = this.drag();
    return drag ? Math.round((drag.x - drag.startX) / this.line().dayWidth) : 0;
  });

  /** The bar being dragged, where it would land. */
  protected readonly preview = computed(() => {
    const drag = this.drag();
    if (!drag || drag.kind === 'link') return null;
    const row = this.rows()[drag.index];
    const days = this.dragDays() * this.line().dayWidth;
    return drag.kind === 'move'
      ? { ...row.bar, x: row.bar.x + days, index: drag.index }
      : {
          ...row.bar,
          width: Math.max(this.line().dayWidth, row.bar.width + days),
          index: drag.index,
        };
  });

  protected readonly linkLine = computed(() => {
    const drag = this.drag();
    if (!drag || drag.kind !== 'link') return null;
    const row = this.rows()[drag.index];
    return { x1: row.bar.x + row.bar.width, y1: rowCenter(drag.index), x2: drag.x, y2: drag.y };
  });

  protected readonly linkTarget = computed(() => {
    const drag = this.drag();
    if (!drag || drag.kind !== 'link') return null;
    const index = this.rowAt(drag.y);
    return index !== null && index !== drag.index ? index : null;
  });

  constructor() {
    // Opens on the project's start rather than on the chart's padding (and again on a new zoom).
    let shownZoom: Zoom | null = null;
    afterRenderEffect(() => {
      const zoom = this.zoom();
      const start = xOf(this.line(), this.projectStart());
      const scroller = this.scroller()?.nativeElement;
      if (!scroller || untracked(() => shownZoom === zoom)) return;
      shownZoom = zoom;
      scroller.scrollLeft = Math.max(0, start - 3 * this.line().dayWidth);
    });
  }

  protected centerY(index: number): number {
    return rowCenter(index);
  }

  protected milestonePoints(bar: BarBox, index: number, size = BAR_HEIGHT / 2 + 2): string {
    const cx = bar.x + this.line().dayWidth / 2;
    const cy = rowCenter(index);
    return `${cx},${cy - size} ${cx + size},${cy} ${cx},${cy + size} ${cx - size},${cy}`;
  }

  // ---------- Pointer editing ----------

  protected start(event: PointerEvent, kind: Drag['kind'], row: Row): void {
    if (!this.editable() || event.button !== 0) return;
    if (kind === 'resize' && row.bar.milestone) return;
    event.preventDefault();
    event.stopPropagation();
    const point = this.point(event);
    this.svg()?.nativeElement.setPointerCapture?.(event.pointerId);
    this.drag.set({ kind, row: row.task, index: row.index, startX: point.x, ...point });
  }

  protected move(event: PointerEvent): void {
    const drag = this.drag();
    if (drag) this.drag.set({ ...drag, ...this.point(event) });
  }

  protected end(): void {
    const drag = this.drag();
    if (!drag) return;
    const days = this.dragDays();
    const target = this.linkTarget();
    this.drag.set(null);
    const task = drag.row;
    if (drag.kind === 'move' && days !== 0) {
      this.moved.emit({ task, start: addDays(task.earlyStart, days) });
    } else if (drag.kind === 'resize' && days !== 0) {
      const finish = addDays(task.earlyFinish, days);
      this.resized.emit({
        task,
        durationDays: Math.max(1, workingDaysBetween(task.earlyStart, finish, this.rule())),
      });
    } else if (drag.kind === 'link' && target !== null) {
      this.linked.emit({ predecessor: task, successor: this.tasks()[target] });
    }
  }

  protected cancel(): void {
    this.drag.set(null);
  }

  private point(event: PointerEvent): { x: number; y: number } {
    const rect = this.svg()?.nativeElement.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  }

  private rowAt(y: number): number | null {
    const index = Math.floor((y - HEADER_HEIGHT) / ROW_HEIGHT);
    return index >= 0 && index < this.tasks().length ? index : null;
  }
}
