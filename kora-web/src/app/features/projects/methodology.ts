import { Methodology } from '../../core/api/api.models';

/** Workspace tabs, in display order. Later phases add time and EVM. */
export type WorkspaceTab =
  | 'overview'
  | 'charter'
  | 'wbs'
  | 'board'
  | 'backlog'
  | 'schedule'
  | 'risks'
  | 'issues'
  | 'stakeholders'
  | 'change-requests';

/** Every project, whatever its methodology, governs risks, issues, stakeholders and changes. */
const GOVERNANCE: readonly WorkspaceTab[] = ['risks', 'issues', 'stakeholders', 'change-requests'];

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
  AGILE: {
    tabs: ['overview', 'charter', 'wbs', 'board', 'backlog', ...GOVERNANCE],
    icon: 'view_kanban',
  },
  PREDICTIVE: { tabs: ['overview', 'charter', 'wbs', 'schedule', ...GOVERNANCE], icon: 'timeline' },
  HYBRID: {
    tabs: ['overview', 'charter', 'wbs', 'board', 'backlog', 'schedule', ...GOVERNANCE],
    icon: 'dashboard',
  },
};

export function tabsFor(methodology: Methodology): readonly WorkspaceTab[] {
  return METHODOLOGY_STRATEGIES[methodology].tabs;
}
