import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { EMPTY, catchError, firstValueFrom, pipe, switchMap, tap } from 'rxjs';
import { ApiError, toApiError } from '../../../core/api/api-error';
import {
  HealthOverrideRequest,
  Project,
  ProjectMember,
  ProjectStatus,
} from '../../../core/api/api.models';
import { ProjectsApi } from '../../../core/api/projects.api';
import { canEditProject } from '../../../core/auth/permissions';
import { Notifier } from '../../../core/notify/notifier';
import { SessionStore } from '../../../core/session/session.store';
import { tabsFor } from '../methodology';

interface ProjectState {
  projectId: string | null;
  project: Project | null;
  status: 'loading' | 'ready' | 'error';
  error: ApiError | null;
  members: ProjectMember[] | null;
  membersError: ApiError | null;
}

const initialState: ProjectState = {
  projectId: null,
  project: null,
  status: 'loading',
  error: null,
  members: null,
  membersError: null,
};

/**
 * One project's workspace (feature 04), provided by the workspace route so every tab shares the
 * same project. Commands that fail outside a form are toasted by the interceptor and leave the
 * state as it was; form commands reject so the dialog can show the error.
 */
export const ProjectStore = signalStore(
  withState(initialState),
  withComputed(({ project }, session = inject(SessionStore)) => ({
    canEdit: computed(() => canEditProject(project(), session.user()?.id, session.activeRole())),
    tabs: computed(() => {
      const current = project();
      return current ? tabsFor(current.methodology) : [];
    }),
  })),
  withMethods(
    (
      store,
      api = inject(ProjectsApi),
      notifier = inject(Notifier),
      transloco = inject(TranslocoService),
    ) => {
      const loadMembers = rxMethod<string>(
        pipe(
          switchMap((projectId) =>
            api.listMembers(projectId).pipe(
              tap((members) => patchState(store, { members, membersError: null })),
              catchError((error: unknown) => {
                patchState(store, { membersError: toApiError(error) });
                return EMPTY;
              }),
            ),
          ),
        ),
      );

      const load = rxMethod<string>(
        pipe(
          tap((projectId) =>
            patchState(store, {
              ...initialState,
              projectId,
              // Keep showing the same project while it reloads.
              project: store.project()?.id === projectId ? store.project() : null,
            }),
          ),
          switchMap((projectId) =>
            api.get(projectId).pipe(
              tap((project) => {
                patchState(store, { project, status: 'ready' });
                loadMembers(projectId);
              }),
              catchError((error: unknown) => {
                patchState(store, { status: 'error', error: toApiError(error) });
                return EMPTY;
              }),
            ),
          ),
        ),
      );

      const t = (key: string, params?: Record<string, unknown>) => transloco.translate(key, params);
      const current = (): Project => {
        const project = store.project();
        if (!project) throw new Error('No project loaded');
        return project;
      };

      return {
        load,
        reload(): void {
          const projectId = store.projectId();
          if (projectId) load(projectId);
        },
        reloadMembers(): void {
          const projectId = store.projectId();
          if (projectId) loadMembers(projectId);
        },
        /** After another tab changed the project (charter approval authorizes it). */
        setProject(project: Project): void {
          patchState(store, { project });
        },

        /** Rejects with the ApiError (the transition dialog shows it). */
        async transition(to: ProjectStatus, reason?: string): Promise<void> {
          const project = await firstValueFrom(
            api.transition(current().id, reason ? { to, reason } : { to }),
          );
          patchState(store, { project });
          notifier.success(
            t('workspace.lifecycle.moved', { status: t(`projectStatus.${project.status}`) }),
          );
        },

        /** Rejects with the ApiError (the health dialog shows it). */
        async overrideHealth(request: HealthOverrideRequest): Promise<void> {
          const project = await firstValueFrom(api.overrideHealth(current().id, request));
          patchState(store, { project });
          notifier.success(t('workspace.health.overridden'));
        },

        async clearHealthOverride(): Promise<void> {
          try {
            const project = await firstValueFrom(api.clearHealthOverride(current().id));
            patchState(store, { project });
            notifier.success(t('workspace.health.cleared'));
          } catch {
            // Toasted by the error interceptor.
          }
        },

        async putMember(
          userId: string,
          projectRole: ProjectMember['projectRole'],
        ): Promise<boolean> {
          if (projectRole === 'MANAGER') return false;
          try {
            await firstValueFrom(api.putMember(current().id, userId, { projectRole }));
            loadMembers(current().id);
            return true;
          } catch {
            return false;
          }
        },

        async removeMember(member: ProjectMember): Promise<boolean> {
          try {
            await firstValueFrom(api.removeMember(current().id, member.userId));
            patchState(store, {
              members: (store.members() ?? []).filter((m) => m.userId !== member.userId),
            });
            notifier.success(t('workspace.team.removed', { name: member.fullName }));
            return true;
          } catch {
            return false;
          }
        },
      };
    },
  ),
);

export type ProjectStore = InstanceType<typeof ProjectStore>;
