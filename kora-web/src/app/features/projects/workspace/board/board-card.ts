import { Component, computed, inject, input, output } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { TranslocoPipe } from '@jsverse/transloco';
import { BoardStatus, Task } from '../../../../core/api/api.models';
import { LanguageService } from '../../../../core/i18n/language.service';
import { LocalizedDatePipe } from '../../../../shared/forms/localized-date.pipe';
import { Avatar, PriorityChip, TaskTypeIcon, canMoveTask } from '../work/task-look';

export interface CardMove {
  task: Task;
  /** Another column, or the same one with `offset` to move up (-1) or down (+1). */
  status: BoardStatus;
  offset?: -1 | 1;
}

/**
 * A task card: key, title (opens the task), type, priority, assignee, points, due date, labels.
 * Its "Move" menu is the keyboard equivalent of dragging: up/down in the column, or to any column
 * the task may go to.
 */
@Component({
  selector: 'kora-board-card',
  imports: [
    Avatar,
    LocalizedDatePipe,
    MatIcon,
    MatIconButton,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    PriorityChip,
    TaskTypeIcon,
    TranslocoPipe,
  ],
  template: `
    <div class="top">
      <kora-task-type [type]="task().type" />
      <span class="key">{{ task().key }}</span>
      @if (movable()) {
        <button
          mat-icon-button
          type="button"
          class="move"
          [matMenuTriggerFor]="menu"
          [attr.aria-label]="'board.moveLabel' | transloco: { key: task().key }"
        >
          <mat-icon svgIcon="more_vert" aria-hidden="true" />
        </button>
        <mat-menu #menu="matMenu">
          <button mat-menu-item type="button" [disabled]="first()" (click)="emit(-1)">
            <mat-icon svgIcon="arrow_upward" aria-hidden="true" />
            {{ 'board.moveUp' | transloco }}
          </button>
          <button mat-menu-item type="button" [disabled]="last()" (click)="emit(1)">
            <mat-icon svgIcon="arrow_downward" aria-hidden="true" />
            {{ 'board.moveDown' | transloco }}
          </button>
          @for (target of targets(); track target.status) {
            <button
              mat-menu-item
              type="button"
              (click)="moved.emit({ task: task(), status: target.status })"
            >
              <mat-icon svgIcon="arrow_forward" aria-hidden="true" />
              {{ 'board.moveTo' | transloco: { column: target.name } }}
            </button>
          }
        </mat-menu>
      }
    </div>
    <button type="button" class="title" (click)="opened.emit(task())">{{ task().title }}</button>
    @if (task().blockedReason) {
      <p class="blocked">
        <mat-icon svgIcon="block" aria-hidden="true" />
        {{ task().blockedReason }}
      </p>
    }
    @if (task().labels.length) {
      <ul class="labels" [attr.aria-label]="'tasks.fields.labels' | transloco">
        @for (label of task().labels; track label) {
          <li>{{ label }}</li>
        }
      </ul>
    }
    <div class="bottom">
      <kora-priority-chip [priority]="task().priority" />
      @if (task().storyPoints !== undefined) {
        <span
          class="points"
          [attr.aria-label]="'board.points' | transloco: { count: task().storyPoints }"
        >
          {{ task().storyPoints }}
        </span>
      }
      @if (task().dueDate) {
        <span class="due">
          <span class="visually-hidden">{{ 'tasks.fields.dueDate' | transloco }}</span>
          {{ task().dueDate | localizedDate: language.current() : 'short' }}
        </span>
      }
      @if (task().assignee; as assignee) {
        <kora-avatar [name]="assignee.fullName" />
      }
    </div>
  `,
  host: { '[class.pending]': 'pending()' },
  styleUrl: './board-card.scss',
})
export class BoardCard {
  readonly task = input.required<Task>();
  /** Columns with their display names, left to right. */
  readonly columns = input.required<readonly { status: BoardStatus; name: string }[]>();
  readonly movable = input(false);
  readonly first = input(false);
  readonly last = input(false);
  readonly pending = input(false);
  readonly moved = output<CardMove>();
  readonly opened = output<Task>();

  protected readonly language = inject(LanguageService);
  protected readonly targets = computed(() =>
    this.columns().filter(
      (c) => c.status !== this.task().status && canMoveTask(this.task().status, c.status),
    ),
  );

  protected emit(offset: -1 | 1): void {
    this.moved.emit({ task: this.task(), status: this.task().status as BoardStatus, offset });
  }
}
