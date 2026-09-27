import { Methodology } from '../../core/api/api.models';

/** Workspace tabs, in display order. Later phases add risks, issues, stakeholders, changes, time, EVM. */
export type WorkspaceTab = 'overview' | 'charter' | 'wbs' | 'board' | 'backlog' | 'schedule';

export interface MethodologyStrategy {
  readonly tabs: readonly WorkspaceTab[];
  /** Icon shown on the methodology picker. */
  readonly icon: string;
}

/**
 * Methodology as a Strategy (feature 04): the one place that decides what a project's workspace
 * offers. Agile plans in a backlog and runs sprints on a board; predictive plans a schedule with
 * dependencies; hybrid does both. Every project has an overview, a charter and a WBS.
 */
export const METHODOLOGY_STRATEGIES: Record<Methodology, MethodologyStrategy> = {
  AGILE: { tabs: ['overview', 'charter', 'wbs', 'board', 'backlog'], icon: 'view_kanban' },
  PREDICTIVE: { tabs: ['overview', 'charter', 'wbs', 'schedule'], icon: 'timeline' },
  HYBRID: {
    tabs: ['overview', 'charter', 'wbs', 'board', 'backlog', 'schedule'],
    icon: 'dashboard',
  },
};

export function tabsFor(methodology: Methodology): readonly WorkspaceTab[] {
  return METHODOLOGY_STRATEGIES[methodology].tabs;
}
