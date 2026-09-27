import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../../core/api/api-error';
import { Charter, CharterContent } from '../../../../core/api/api.models';
import { CharterApi } from '../../../../core/api/charter.api';
import { ProjectsApi } from '../../../../core/api/projects.api';
import { canDecideCharter } from '../../../../core/auth/permissions';
import { ErrorMessages } from '../../../../core/errors/error-messages';
import { Notifier } from '../../../../core/notify/notifier';
import { SessionStore } from '../../../../core/session/session.store';
import { ProjectStore } from '../project.store';

interface CharterState {
  charter: Charter | null;
  status: 'loading' | 'ready' | 'error';
  error: ApiError | null;
  /** A submit/approve/return in flight. */
  busy: boolean;
  /** Fields the API said are missing when submitting (`charters.incomplete`). */
  missing: string[];
  /** Why the last submit or approve failed (those calls aren't toasted; the tab shows this). */
  actionError: string | null;
}

const initialState: CharterState = {
  charter: null,
  status: 'loading',
  error: null,
  busy: false,
  missing: [],
  actionError: null,
};

/**
 * The charter tab's state (feature 06). The PM drafts and submits; the sponsor, PMO or an admin
 * approves (which authorizes the project: PROPOSED → APPROVED) or returns it with a comment.
 */
export const CharterStore = signalStore(
  withState(initialState),
  withComputed(({ charter }, project = inject(ProjectStore), session = inject(SessionStore)) => ({
    canEdit: computed(() => project.canEdit() && charter()?.status === 'DRAFT'),
    canSubmit: computed(() => project.canEdit() && charter()?.status === 'DRAFT'),
    canDecide: computed(
      () =>
        charter()?.status === 'SUBMITTED' &&
        canDecideCharter(charter(), session.user()?.id, session.activeRole()),
    ),
  })),
  withMethods(
    (
      store,
      api = inject(CharterApi),
      projectsApi = inject(ProjectsApi),
      project = inject(ProjectStore),
      notifier = inject(Notifier),
      transloco = inject(TranslocoService),
      messages = inject(ErrorMessages),
    ) => {
      const projectId = (): string => {
        const id = project.projectId();
        if (!id) throw new Error('No project loaded');
        return id;
      };
      const t = (key: string) => transloco.translate(key);

      /** Runs submit or approve; a failure is kept in `actionError` (and `missing`) for the tab. */
      const command = async (run: () => Promise<Charter>, successKey: string): Promise<boolean> => {
        patchState(store, { busy: true, missing: [], actionError: null });
        try {
          const charter = await run();
          patchState(store, { charter });
          notifier.success(t(successKey));
          return true;
        } catch (error: unknown) {
          const apiError = toApiError(error);
          patchState(store, {
            actionError: messages.message(apiError),
            missing:
              apiError.code === 'charters.incomplete'
                ? apiError.fieldErrors.map((e) => e.field)
                : [],
          });
          // Someone else changed it meanwhile: show the current charter.
          if (apiError.status === 409 && apiError.code !== 'charters.incomplete') void reload();
          return false;
        } finally {
          patchState(store, { busy: false });
        }
      };

      const reload = async (): Promise<void> => {
        patchState(store, { status: 'loading', error: null });
        try {
          const charter = await firstValueFrom(api.get(projectId()));
          patchState(store, { charter, status: 'ready' });
        } catch (error: unknown) {
          patchState(store, { status: 'error', error: toApiError(error) });
        }
      };

      return {
        load: reload,
        dismissError: () => patchState(store, { actionError: null, missing: [] }),

        /** Saves the draft; rejects with the ApiError so the editor can show it. */
        async replace(content: CharterContent): Promise<void> {
          const current = store.charter();
          if (!current) return;
          const charter = await firstValueFrom(api.replace(projectId(), content, current.version));
          patchState(store, { charter, missing: [] });
          notifier.success(t('charter.saved'));
          // A new sponsor joins the team as an observer.
          project.reloadMembers();
        },

        submit: () => command(() => firstValueFrom(api.submit(projectId())), 'charter.submitted'),

        async approve(): Promise<boolean> {
          const approved = await command(
            () => firstValueFrom(api.approve(projectId())),
            'charter.approved',
          );
          // Approval authorizes the project; show its new status and transitions.
          if (approved) {
            project.setProject(await firstValueFrom(projectsApi.get(projectId())));
          }
          return approved;
        },

        /** Sends it back with a comment; rejects with the ApiError for the dialog. */
        async returnToDraft(comment: string): Promise<void> {
          const charter = await firstValueFrom(api.returnToDraft(projectId(), comment));
          patchState(store, { charter, actionError: null, missing: [] });
          notifier.success(t('charter.returned'));
        },

        versions: () => firstValueFrom(api.versions(projectId())),
      };
    },
  ),
);

export type CharterStore = InstanceType<typeof CharterStore>;
