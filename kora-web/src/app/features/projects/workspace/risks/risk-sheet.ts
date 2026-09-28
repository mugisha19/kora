import { Component, computed, inject, input, resource } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { RiskAssessment } from '../../../../core/api/api.models';
import { toApiError } from '../../../../core/api/api-error';
import { RisksApi } from '../../../../core/api/risks.api';
import { LanguageService } from '../../../../core/i18n/language.service';
import { LocalizedDatePipe } from '../../../../shared/forms/localized-date.pipe';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { StatusChip } from '../../../../shared/ui/status-chip';
import { SeverityChip } from '../governance-look';
import { routeSheet } from '../route-sheet';
import { RiskFacade } from './risk.facade';
import { severityOf } from './risk-scoring';
import { AttachmentsPanel } from '../attachments/attachments-panel';
import { HistorySection } from '../history/history-section';
import { ProjectStore } from '../project.store';

/** Score history as a small line: one point per assessment, oldest on the left. */
@Component({
  selector: 'kora-score-sparkline',
  template: `
    <svg
      role="img"
      [attr.aria-label]="label()"
      [attr.viewBox]="'0 0 ' + width + ' ' + height"
      [attr.width]="width"
      [attr.height]="height"
    >
      <line class="band" x1="0" [attr.x2]="width" [attr.y1]="y(15)" [attr.y2]="y(15)" />
      <polyline class="line" [attr.points]="points()" />
      @for (p of dots(); track $index) {
        <circle class="dot" [attr.cx]="p.x" [attr.cy]="p.y" r="3" />
      }
    </svg>
  `,
  styles: `
    svg {
      display: block;
      overflow: visible;
    }
    .line {
      fill: none;
      stroke: var(--mat-sys-primary);
      stroke-width: 2;
    }
    .dot {
      fill: var(--mat-sys-primary);
    }
    .band {
      stroke: var(--kora-danger-fg);
      stroke-dasharray: 3 3;
      opacity: 0.6;
    }
  `,
})
export class ScoreSparkline {
  readonly scores = input.required<readonly number[]>();
  readonly label = input.required<string>();
  protected readonly width = 200;
  protected readonly height = 48;

  protected y(score: number): number {
    return this.height - 4 - ((score - 1) / 24) * (this.height - 8);
  }

  protected readonly dots = computed(() => {
    const scores = this.scores();
    const step = scores.length > 1 ? (this.width - 8) / (scores.length - 1) : 0;
    return scores.map((score, i) => ({ x: 4 + i * step, y: this.y(score) }));
  });
  protected readonly points = computed(() =>
    this.dots()
      .map((p) => `${p.x},${p.y}`)
      .join(' '),
  );
}

export interface RiskSheetData {
  riskId: string;
}

/**
 * One risk in a side sheet (feature 11): its score and band, response, review date, closure, and
 * the assessment history as a line and a list. Its owner and the project's managers act on it.
 */
@Component({
  selector: 'kora-risk-sheet',
  imports: [
    AttachmentsPanel,
    HistorySection,
    ErrorState,
    LoadingState,
    LocalizedDatePipe,
    MatButton,
    MatDialogActions,
    MatDialogContent,
    MatDialogTitle,
    MatIcon,
    RouterLink,
    ScoreSparkline,
    SeverityChip,
    StatusChip,
    TranslocoPipe,
  ],
  templateUrl: './risk-sheet.html',
  styleUrl: './risk-sheet.scss',
})
export class RiskSheet {
  protected readonly data = inject<RiskSheetData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<RiskSheet>);
  private readonly api = inject(RisksApi);
  protected readonly facade = inject(RiskFacade);
  protected readonly project = inject(ProjectStore);
  protected readonly language = inject(LanguageService);

  protected readonly risk = resource({
    params: () => ({ id: this.data.riskId, version: this.facade.version() }),
    loader: ({ params }) => firstValueFrom(this.api.get(params.id)),
  });
  protected readonly history = resource({
    params: () => ({ id: this.data.riskId, version: this.facade.version() }),
    loader: ({ params }) => firstValueFrom(this.api.assessments(params.id)),
  });
  protected readonly notFound = computed(() => {
    const error = this.risk.error();
    return !!error && toApiError(error).status === 404;
  });
  protected readonly scores = computed(() =>
    this.history.hasValue() ? this.history.value().map((a) => a.score) : [],
  );

  protected band(score: number) {
    return severityOf(score);
  }

  protected residual(assessment: RiskAssessment): number | undefined {
    return assessment.residualProbability && assessment.residualImpact
      ? assessment.residualProbability * assessment.residualImpact
      : undefined;
  }

  protected close(): void {
    this.dialogRef.close();
  }
}

/**
 * `/projects/:id/risks/:riskId`: the risk's sheet over the register (notification links land here).
 */
@Component({ selector: 'kora-risk-sheet-route', template: '' })
export class RiskSheetRoute {
  /** Route parameter. */
  readonly riskId = input.required<string>();

  constructor() {
    routeSheet<RiskSheet, RiskSheetData>(RiskSheet, this.riskId, (riskId) => ({ riskId }));
  }
}
