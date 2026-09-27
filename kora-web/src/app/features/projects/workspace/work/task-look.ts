import { Component, computed, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { Task, TaskPriority, TaskStatus, TaskType } from '../../../../core/api/api.models';
import { StatusChip, StatusTone } from '../../../../shared/ui/status-chip';

/**
 * The task lifecycle, mirrored from the API (which enforces it) so the board only offers moves
 * that can succeed. Staying in the same status is a reorder.
 */
export const TASK_NEXT: Record<TaskStatus, readonly TaskStatus[]> = {
  BACKLOG: ['TODO'],
  TODO: ['BACKLOG', 'IN_PROGRESS', 'BLOCKED'],
  IN_PROGRESS: ['TODO', 'IN_REVIEW', 'BLOCKED'],
  BLOCKED: ['TODO', 'IN_PROGRESS'],
  IN_REVIEW: ['IN_PROGRESS', 'DONE'],
  DONE: ['TODO'],
};

export function canMoveTask(from: TaskStatus, to: TaskStatus): boolean {
  return from === to || TASK_NEXT[from].includes(to);
}

/** Contributors change tasks assigned to them or to nobody; managers change any. */
export function canChangeTask(
  task: Pick<Task, 'assignee'>,
  userId: string | undefined,
  rights: { manages: boolean; contributes: boolean },
): boolean {
  if (rights.manages) return true;
  return rights.contributes && (!task.assignee || task.assignee.userId === userId);
}

export const TASK_TYPE_ICON: Record<TaskType, string> = {
  STORY: 'bookmark',
  TASK: 'check_box',
  BUG: 'bug_report',
  CHORE: 'build',
};

export const PRIORITY_LOOK: Record<TaskPriority, { tone: StatusTone; icon: string }> = {
  CRITICAL: { tone: 'danger', icon: 'keyboard_double_arrow_up' },
  HIGH: { tone: 'warning', icon: 'keyboard_arrow_up' },
  MEDIUM: { tone: 'neutral', icon: 'drag_handle' },
  LOW: { tone: 'info', icon: 'keyboard_arrow_down' },
};

/** Priority as a chip: an arrow shape plus the word, so it reads without colour. */
@Component({
  selector: 'kora-priority-chip',
  imports: [StatusChip, TranslocoPipe],
  template: `
    <kora-status-chip
      [tone]="look().tone"
      [icon]="look().icon"
      [label]="'taskPriority.' + priority() | transloco"
    />
  `,
})
export class PriorityChip {
  readonly priority = input.required<TaskPriority>();
  protected readonly look = computed(() => PRIORITY_LOOK[this.priority()]);
}

/** The task type's icon with its name for assistive technology. */
@Component({
  selector: 'kora-task-type',
  imports: [MatIcon, TranslocoPipe],
  template: `
    <mat-icon [svgIcon]="icon()" aria-hidden="true" />
    <span class="visually-hidden">{{ 'taskType.' + type() | transloco }}</span>
  `,
  styles: `
    :host {
      display: inline-flex;
      color: var(--mat-sys-on-surface-variant);
    }
    mat-icon {
      inline-size: 18px;
      block-size: 18px;
    }
  `,
})
export class TaskTypeIcon {
  readonly type = input.required<TaskType>();
  protected readonly icon = computed(() => TASK_TYPE_ICON[this.type()]);
}

/** Initials in a circle, the name for assistive technology (and as a tooltip). */
@Component({
  selector: 'kora-avatar',
  template: `<span aria-hidden="true">{{ initials() }}</span
    ><span class="visually-hidden">{{ name() }}</span>`,
  host: { '[attr.title]': 'name()' },
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      inline-size: 28px;
      block-size: 28px;
      border-radius: 50%;
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
      font: var(--mat-sys-label-medium);
      flex: none;
    }
  `,
})
export class Avatar {
  readonly name = input.required<string>();
  protected readonly initials = computed(() =>
    this.name()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(''),
  );
}

/** The API's default column names; a column still called this shows its translated status. */
export const DEFAULT_COLUMN_NAMES: Record<string, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  BLOCKED: 'Blocked',
  IN_REVIEW: 'In review',
  DONE: 'Done',
};
