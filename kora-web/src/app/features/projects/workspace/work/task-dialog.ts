import { Component, ElementRef, Injector, computed, inject, resource, signal } from '@angular/core';
import { FormField, form, maxLength, required, validate } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatError, MatFormField, MatHint, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import {
  CreateTaskRequest,
  ProjectMember,
  TASK_PRIORITIES,
  TASK_TYPES,
  Task,
  TaskPriority,
  TaskType,
  UpdateTaskRequest,
} from '../../../../core/api/api.models';
import { toApiError } from '../../../../core/api/api-error';
import { TasksApi } from '../../../../core/api/tasks.api';
import { ErrorMessages } from '../../../../core/errors/error-messages';
import { LanguageService } from '../../../../core/i18n/language.service';
import { FieldError, I18N_ERROR } from '../../../../shared/forms/field-error';
import { submitWithApi } from '../../../../shared/forms/form-helpers';
import { LocalizedDatePipe } from '../../../../shared/forms/localized-date.pipe';
import { Markdown } from '../../../../shared/markdown/markdown';
import { StatusChip } from '../../../../shared/ui/status-chip';
import { PriorityChip, TaskTypeIcon } from './task-look';

export interface TaskDialogData {
  /** The task to show and edit; absent to create one. */
  task?: Task;
  /** Where a new task starts. */
  defaults?: { status?: 'BACKLOG' | 'TODO'; sprintId?: string };
  assignable: readonly ProjectMember[];
  canChange: boolean;
  canComment: boolean;
  canDelete: boolean;
  /** Creates or updates; rejects with an ApiError the form shows. */
  save: (request: CreateTaskRequest | UpdateTaskRequest, task?: Task) => Promise<Task>;
  remove?: (task: Task) => Promise<boolean>;
}

interface TaskForm {
  title: string;
  type: TaskType;
  priority: TaskPriority;
  assigneeId: string;
  storyPoints: string;
  estimateHours: string;
  remainingHours: string;
  startDate: string;
  dueDate: string;
  labels: string;
  description: string;
}

const numberOrNull = (text: string) => (text.trim() === '' ? null : Number(text.replace(',', '.')));
const LABEL = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,29}$/u;

/**
 * A task in a side sheet: its fields (editable by whoever may change it), its description in
 * Markdown, and its comments. Also creates tasks. Status changes happen on the board.
 */
@Component({
  selector: 'kora-task-dialog',
  imports: [
    FieldError,
    FormField,
    LocalizedDatePipe,
    Markdown,
    MatButton,
    MatDialogActions,
    MatDialogContent,
    MatDialogTitle,
    MatError,
    MatFormField,
    MatHint,
    MatIcon,
    MatInput,
    MatLabel,
    MatOption,
    MatSelect,
    MatSuffix,
    PriorityChip,
    StatusChip,
    TaskTypeIcon,
    TranslocoPipe,
  ],
  templateUrl: './task-dialog.html',
  styleUrl: './task-dialog.scss',
})
export class TaskDialog {
  protected readonly data = inject<TaskDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<TaskDialog, Task | 'deleted'>);
  private readonly api = inject(TasksApi);
  protected readonly language = inject(LanguageService);

  protected readonly types = TASK_TYPES;
  protected readonly priorities = TASK_PRIORITIES;
  protected readonly task = signal<Task | undefined>(this.data.task);
  protected readonly editing = signal(!this.data.task);

  protected readonly comments = resource({
    params: () => this.data.task?.id,
    loader: ({ params }) => firstValueFrom(this.api.comments(params)),
  });
  protected readonly commentText = signal('');
  protected readonly commentError = signal<string | null>(null);
  protected readonly posting = signal(false);

  protected readonly formError = signal<string | null>(null);
  protected readonly model = signal<TaskForm>(this.initial());
  protected readonly form = form(this.model, (path) => {
    required(path.title);
    maxLength(path.title, 200);
    maxLength(path.description, 10_000);
    validate(path.storyPoints, ({ value }) => this.whole(value(), 100));
    validate(path.estimateHours, ({ value }) => this.hours(value()));
    validate(path.remainingHours, ({ value }) => this.hours(value()));
    validate(path.dueDate, ({ value, valueOf }) => {
      const start = valueOf(path.startDate);
      return start && value() && value() < start
        ? { kind: I18N_ERROR, message: 'tasks.errors.dueBeforeStart' }
        : undefined;
    });
    validate(path.labels, ({ value }) => {
      const labels = this.labelList(value());
      if (labels.length > 10) return { kind: I18N_ERROR, message: 'tasks.errors.tooManyLabels' };
      return labels.every((l) => LABEL.test(l))
        ? undefined
        : { kind: I18N_ERROR, message: 'tasks.errors.label' };
    });
  });

  private readonly messages = inject(ErrorMessages);
  private readonly transloco = inject(TranslocoService);
  private readonly context = {
    messages: this.messages,
    formError: this.formError,
    host: inject<ElementRef<HTMLElement>>(ElementRef),
    injector: inject(Injector),
  };

  protected readonly assigneeName = computed(() => this.task()?.assignee?.fullName);

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const request = this.request();
    let saved: Task | undefined;
    const ok = await submitWithApi(this.form, this.context, async () => {
      saved = await this.data.save(request, this.task());
    });
    if (!ok || !saved) return;
    if (this.data.task) {
      this.task.set(saved);
      this.editing.set(false);
    } else {
      this.dialogRef.close(saved);
    }
  }

  protected cancelEdit(): void {
    if (!this.data.task) {
      this.dialogRef.close();
      return;
    }
    this.model.set(this.initial());
    this.formError.set(null);
    this.editing.set(false);
  }

  protected async remove(): Promise<void> {
    const task = this.task();
    if (task && this.data.remove && (await this.data.remove(task))) {
      this.dialogRef.close('deleted');
    }
  }

  protected close(): void {
    this.dialogRef.close(this.task());
  }

  protected async comment(event: Event): Promise<void> {
    event.preventDefault();
    const body = this.commentText().trim();
    const task = this.task();
    if (!body || !task) {
      this.commentError.set(body ? null : this.transloco.translate('errors.fields.required'));
      return;
    }
    this.posting.set(true);
    this.commentError.set(null);
    try {
      await firstValueFrom(this.api.addComment(task.id, body));
      this.commentText.set('');
      this.comments.reload();
    } catch (error: unknown) {
      this.commentError.set(this.messages.message(toApiError(error)));
    } finally {
      this.posting.set(false);
    }
  }

  protected onCommentInput(event: Event): void {
    this.commentText.set((event.target as HTMLTextAreaElement).value);
  }

  private request(): CreateTaskRequest & UpdateTaskRequest {
    const m = this.model();
    const numbers = {
      storyPoints: numberOrNull(m.storyPoints),
      estimateHours: numberOrNull(m.estimateHours),
      remainingHours: numberOrNull(m.remainingHours),
    };
    const request: CreateTaskRequest & UpdateTaskRequest = {
      title: m.title.trim(),
      type: m.type,
      priority: m.priority,
      description: m.description,
      labels: this.labelList(m.labels),
      ...(m.assigneeId ? { assigneeId: m.assigneeId } : {}),
      ...(numbers.storyPoints !== null ? { storyPoints: numbers.storyPoints } : {}),
      ...(numbers.estimateHours !== null ? { estimateHours: numbers.estimateHours } : {}),
      ...(numbers.remainingHours !== null ? { remainingHours: numbers.remainingHours } : {}),
      ...(m.startDate ? { startDate: m.startDate } : {}),
      ...(m.dueDate ? { dueDate: m.dueDate } : {}),
    };
    if (!this.data.task) {
      const defaults = this.data.defaults ?? {};
      return {
        ...request,
        ...(defaults.status ? { status: defaults.status } : {}),
        ...(defaults.sprintId ? { sprintId: defaults.sprintId } : {}),
      };
    }
    return request;
  }

  private initial(): TaskForm {
    const task = this.task?.() ?? this.data.task;
    const text = (value: number | undefined) => (value === undefined ? '' : String(value));
    return {
      title: task?.title ?? '',
      type: task?.type ?? 'STORY',
      priority: task?.priority ?? 'MEDIUM',
      assigneeId: task?.assignee?.userId ?? '',
      storyPoints: text(task?.storyPoints),
      estimateHours: text(task?.estimateHours),
      remainingHours: text(task?.remainingHours),
      startDate: task?.startDate ?? '',
      dueDate: task?.dueDate ?? '',
      labels: task?.labels.join(', ') ?? '',
      description: task?.description ?? '',
    };
  }

  private labelList(text: string): string[] {
    return [
      ...new Set(
        text
          .split(',')
          .map((l) => l.trim())
          .filter(Boolean),
      ),
    ];
  }

  private whole(text: string, max: number) {
    if (!text.trim()) return undefined;
    const value = Number(text);
    return Number.isInteger(value) && value >= 0 && value <= max
      ? undefined
      : { kind: I18N_ERROR, message: 'tasks.errors.points' };
  }

  private hours(text: string) {
    if (!text.trim()) return undefined;
    const value = numberOrNull(text);
    return value !== null && !Number.isNaN(value) && value >= 0 && value <= 10_000
      ? undefined
      : { kind: I18N_ERROR, message: 'tasks.errors.hours' };
  }
}
