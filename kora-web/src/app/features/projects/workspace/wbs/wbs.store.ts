import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../../../core/api/api-error';
import {
  CreateWbsNodeRequest,
  UpdateWbsNodeRequest,
  WBS_MAX_DEPTH,
  WbsNode,
  WbsTree,
} from '../../../../core/api/api.models';
import { WbsApi } from '../../../../core/api/wbs.api';
import { Notifier } from '../../../../core/notify/notifier';
import { ProjectStore } from '../project.store';

/** A node with where it sits in the tree, for ARIA (level, position in set) and keyboard moves. */
export interface PlacedNode {
  node: WbsNode;
  parentId: string | null;
  level: number;
  /** 0-based position among its siblings. */
  index: number;
  setSize: number;
}

interface WbsState {
  tree: WbsTree | null;
  status: 'loading' | 'ready' | 'error';
  error: ApiError | null;
  /** Deliverables whose children are shown. */
  expanded: string[];
  /** The node the keyboard is on and the toolbar acts on. */
  selectedId: string | null;
  busy: boolean;
}

const initialState: WbsState = {
  tree: null,
  status: 'loading',
  error: null,
  expanded: [],
  selectedId: null,
  busy: false,
};

function place(
  nodes: readonly WbsNode[],
  parentId: string | null,
  level: number,
  out: Map<string, PlacedNode>,
) {
  nodes.forEach((node, index) => {
    out.set(node.id, { node, parentId, level, index, setSize: nodes.length });
    place(node.children, node.id, level + 1, out);
  });
}

function height(node: WbsNode): number {
  return 1 + Math.max(0, ...node.children.map(height));
}

/**
 * The WBS tab's state (feature 07). The API rolls values up (effort-weighted progress) and derives
 * the codes, so after any change the tree is fetched again (or taken from the move response)
 * rather than recomputed here. Deletes and moves can be undone from the toast.
 */
export const WbsStore = signalStore(
  withState(initialState),
  withComputed(({ tree, expanded, selectedId }) => {
    const placed = computed(() => {
      const map = new Map<string, PlacedNode>();
      place(tree()?.nodes ?? [], null, 1, map);
      return map;
    });
    /** Nodes in reading order, skipping the children of collapsed deliverables. */
    const visible = computed(() => {
      const open = new Set(expanded());
      const out: PlacedNode[] = [];
      const walk = (nodes: readonly WbsNode[]) => {
        for (const node of nodes) {
          const entry = placed().get(node.id);
          if (entry) out.push(entry);
          if (open.has(node.id)) walk(node.children);
        }
      };
      walk(tree()?.nodes ?? []);
      return out;
    });
    return {
      placed,
      visible,
      selected: computed(() => {
        const id = selectedId();
        return id ? (placed().get(id) ?? null) : null;
      }),
      isEmpty: computed(() => (tree()?.nodes.length ?? 0) === 0),
    };
  }),
  withMethods(
    (
      store,
      api = inject(WbsApi),
      project = inject(ProjectStore),
      notifier = inject(Notifier),
      transloco = inject(TranslocoService),
    ) => {
      const projectId = (): string => {
        const id = project.projectId();
        if (!id) throw new Error('No project loaded');
        return id;
      };
      const t = (key: string, params?: Record<string, unknown>) => transloco.translate(key, params);

      const setTree = (tree: WbsTree) => {
        const ids = new Set<string>();
        const collect = (nodes: readonly WbsNode[]) =>
          nodes.forEach((n) => {
            ids.add(n.id);
            collect(n.children);
          });
        collect(tree.nodes);
        patchState(store, {
          tree,
          status: 'ready',
          error: null,
          expanded: store.expanded().filter((id) => ids.has(id)),
          selectedId:
            store.selectedId() && ids.has(store.selectedId() ?? '')
              ? store.selectedId()
              : (tree.nodes[0]?.id ?? null),
        });
      };

      const reload = async (): Promise<void> => {
        try {
          setTree(await firstValueFrom(api.get(projectId())));
        } catch (error: unknown) {
          patchState(store, { status: 'error', error: toApiError(error) });
        }
      };

      const expand = (...ids: string[]) =>
        patchState(store, { expanded: [...new Set([...store.expanded(), ...ids])] });

      /** Re-creates a deleted subtree (new ids) where it was. */
      const recreate = async (node: WbsNode, parentId: string | null, position: number) => {
        const created = await firstValueFrom(
          api.create(projectId(), {
            ...(parentId ? { parentId } : {}),
            name: node.name,
            ...(node.description ? { description: node.description } : {}),
            type: node.type,
            ...(node.owner ? { ownerId: node.owner.userId } : {}),
            ...(node.type === 'WORK_PACKAGE'
              ? {
                  plannedEffortHours: node.plannedEffortHours,
                  plannedCost: node.plannedCost.amount,
                  ...(node.percentCompleteSource === 'REPORTED'
                    ? { percentComplete: node.percentComplete }
                    : {}),
                }
              : {}),
            position,
          }),
        );
        for (const [index, child] of node.children.entries()) {
          await recreate(child, created.id, index);
        }
        return created;
      };

      /** Runs one API call with `busy` set (disables the move buttons; the call isn't repeated). */
      const whileBusy = async <T>(run: () => Promise<T>): Promise<T> => {
        patchState(store, { busy: true });
        try {
          return await run();
        } finally {
          patchState(store, { busy: false });
        }
      };

      const move = async (
        entry: PlacedNode,
        newParentId: string | null,
        position: number,
        announceKey: string,
      ): Promise<void> => {
        try {
          const tree = await whileBusy(() =>
            firstValueFrom(
              api.move(entry.node.id, { ...(newParentId ? { newParentId } : {}), position }),
            ),
          );
          if (newParentId) expand(newParentId);
          setTree(tree);
          const moved = store.placed().get(entry.node.id);
          // Not busy while the toast waits: the user can keep working, and Undo still applies.
          const undo = await notifier.undoable(
            t(announceKey, { name: entry.node.name, code: moved?.node.code ?? '' }),
          );
          if (undo) {
            const back = await whileBusy(() =>
              firstValueFrom(
                api.move(entry.node.id, {
                  ...(entry.parentId ? { newParentId: entry.parentId } : {}),
                  position: entry.index,
                }),
              ),
            );
            setTree(back);
          }
        } catch {
          // Toasted by the error interceptor (move isn't silent); reload in case the tree changed.
          await reload();
        }
      };

      return {
        async load(): Promise<void> {
          patchState(store, { status: 'loading', error: null });
          await reload();
          // Start with the top level open so the tree isn't a single line.
          expand(...(store.tree()?.nodes.map((n) => n.id) ?? []));
        },
        reload,

        select(id: string): void {
          patchState(store, { selectedId: id });
        },
        toggle(id: string): void {
          const open = store.expanded().includes(id);
          patchState(store, {
            expanded: open ? store.expanded().filter((e) => e !== id) : [...store.expanded(), id],
          });
        },
        expand,
        collapse(id: string): void {
          patchState(store, { expanded: store.expanded().filter((e) => e !== id) });
        },
        expandAll(): void {
          patchState(store, {
            expanded: [...store.placed().values()]
              .filter((p) => p.node.children.length > 0)
              .map((p) => p.node.id),
          });
        },
        collapseAll(): void {
          const selected = store.selected();
          // Keep the keyboard on a visible node: the top-level ancestor of the selection.
          let top = selected;
          while (top?.parentId) top = store.placed().get(top.parentId) ?? null;
          patchState(store, { expanded: [], selectedId: top?.node.id ?? store.selectedId() });
        },

        /** Rejects with the ApiError (the node dialog shows it). */
        async create(request: CreateWbsNodeRequest): Promise<void> {
          const created = await firstValueFrom(api.create(projectId(), request));
          if (request.parentId) expand(request.parentId);
          await reload();
          patchState(store, { selectedId: created.id });
          notifier.success(t('wbs.created', { name: created.name }));
        },

        /** Rejects with the ApiError (the node dialog shows it). */
        async update(node: WbsNode, body: UpdateWbsNodeRequest): Promise<void> {
          await firstValueFrom(api.update(node.id, body, node.version));
          // PATCH returns only the node; ancestors' roll-ups and codes need the whole tree.
          await reload();
          notifier.success(t('wbs.saved', { name: body.name ?? node.name }));
        },

        /** Deletes a node (and its subtree); the toast offers to undo by re-creating it. */
        async remove(entry: PlacedNode): Promise<void> {
          try {
            await whileBusy(async () => {
              await firstValueFrom(api.delete(entry.node.id, entry.node.children.length > 0));
              await reload();
            });
            const undo = await notifier.undoable(t('wbs.deleted', { name: entry.node.name }));
            if (undo) {
              const restored = await whileBusy(async () => {
                const node = await recreate(entry.node, entry.parentId, entry.index);
                await reload();
                return node;
              });
              // It comes back with new ids: open it as it was, and keep the keyboard on it.
              expand(restored.id);
              patchState(store, { selectedId: restored.id });
            }
          } catch {
            // Toasted by the error interceptor.
            await reload();
          }
        },

        // ---------- Keyboard moves (Alt + arrows), each one call to /move ----------

        canMoveUp: (entry: PlacedNode) => entry.index > 0,
        canMoveDown: (entry: PlacedNode) => entry.index < entry.setSize - 1,
        /** Indent: become the last child of the previous sibling, if that's a deliverable. */
        indentTarget(entry: PlacedNode): WbsNode | null {
          const siblings = entry.parentId
            ? (store.placed().get(entry.parentId)?.node.children ?? [])
            : (store.tree()?.nodes ?? []);
          const previous = siblings[entry.index - 1];
          if (!previous || previous.type !== 'DELIVERABLE') return null;
          return entry.level + height(entry.node) <= WBS_MAX_DEPTH ? previous : null;
        },
        canOutdent: (entry: PlacedNode) => entry.parentId !== null,

        moveUp(entry: PlacedNode): Promise<void> {
          return move(entry, entry.parentId, entry.index - 1, 'wbs.moved');
        },
        moveDown(entry: PlacedNode): Promise<void> {
          return move(entry, entry.parentId, entry.index + 1, 'wbs.moved');
        },
        indent(entry: PlacedNode, target: WbsNode): Promise<void> {
          return move(entry, target.id, target.children.length, 'wbs.moved');
        },
        outdent(entry: PlacedNode): Promise<void> {
          const parent = entry.parentId ? store.placed().get(entry.parentId) : null;
          if (!parent) return Promise.resolve();
          return move(entry, parent.parentId, parent.index + 1, 'wbs.moved');
        },
      };
    },
  ),
);

export type WbsStore = InstanceType<typeof WbsStore>;
