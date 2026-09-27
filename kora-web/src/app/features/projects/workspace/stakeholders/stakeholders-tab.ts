import { Component, computed, inject, input, resource } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import {
  ENGAGEMENTS,
  STAKEHOLDER_QUADRANTS,
  StakeholderQuadrant,
} from '../../../../core/api/api.models';
import { StakeholdersApi } from '../../../../core/api/stakeholders.api';
import { QueryParams, oneOfParam } from '../../../../shared/routing/query-params';
import { EmptyState } from '../../../../shared/ui/empty-state';
import { ErrorState } from '../../../../shared/ui/error-state';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { ProjectStore } from '../project.store';
import { StakeholderGrid } from './stakeholder-grid';
import { StakeholderFacade } from './stakeholder.facade';

/**
 * Stakeholders tab (feature 13): the power/interest grid, the engagement matrix (current "C"
 * against desired "D") and the register. "Engagement gap" and a chosen quadrant filter both the
 * matrix and the register, and live in the URL.
 */
@Component({
  selector: 'kora-stakeholders-tab',
  imports: [
    EmptyState,
    ErrorState,
    LoadingState,
    MatButton,
    MatIcon,
    StakeholderGrid,
    TranslocoPipe,
  ],
  providers: [StakeholderFacade, QueryParams],
  templateUrl: './stakeholders-tab.html',
  styleUrls: ['../governance-table.scss', './stakeholders-tab.scss'],
})
export class StakeholdersTab {
  /** Query parameters (bound by the router). */
  readonly gap = input<string>();
  readonly quadrant = input<string>();

  protected readonly facade = inject(StakeholderFacade);
  protected readonly queryParams = inject(QueryParams);
  private readonly project = inject(ProjectStore);
  private readonly api = inject(StakeholdersApi);

  protected readonly engagements = ENGAGEMENTS;
  protected readonly gapOnly = computed(() => this.gap() === 'true');
  protected readonly chosenQuadrant = computed(() =>
    oneOfParam(this.quadrant(), STAKEHOLDER_QUADRANTS),
  );

  protected readonly grid = resource({
    params: () => ({ projectId: this.project.projectId() ?? '', version: this.facade.version() }),
    loader: ({ params }) => firstValueFrom(this.api.grid(params.projectId)),
  });
  protected readonly register = resource({
    params: () => ({
      projectId: this.project.projectId() ?? '',
      gap: this.gapOnly() || undefined,
      quadrant: this.chosenQuadrant() ?? undefined,
      version: this.facade.version(),
    }),
    loader: ({ params }) =>
      firstValueFrom(
        this.api.list(params.projectId, {
          gap: params.gap,
          quadrant: params.quadrant,
          size: 100,
        }),
      ),
  });
  protected readonly stakeholders = computed(() =>
    this.register.hasValue() ? this.register.value().content : [],
  );

  protected setGap(on: boolean): void {
    void this.queryParams.set({ gap: on ? 'true' : null });
  }

  protected setQuadrant(quadrant: StakeholderQuadrant | null): void {
    void this.queryParams.set({ quadrant });
  }
}
