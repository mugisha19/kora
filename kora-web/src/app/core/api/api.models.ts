/**
 * Friendly names for the types generated from the API contract (`kora-api/docs/openapi.yaml`).
 * Features import from here, never from `generated/`, so a regenerated schema breaks only this file.
 * Regenerate with `npm run api:generate`; CI runs `npm run api:check`.
 */
import type { components, operations } from './generated/schema';

type Schemas = components['schemas'];

export type Role = Schemas['Role'];
export type Locale = Schemas['Locale'];
export type ErrorCode = Schemas['ErrorCode'];
export type InvitationStatus = Schemas['InvitationStatus'];

export type MembershipSummary = Schemas['Membership'];
export type MeResponse = Schemas['MeResponse'];
export type SessionResponse = Schemas['SessionResponse'];
export type LoginRequest = Schemas['LoginRequest'];
export type RegisterOrganizationRequest = Schemas['RegisterOrganizationRequest'];
export type ForgotPasswordRequest = Schemas['ForgotPasswordRequest'];
export type ResetPasswordRequest = Schemas['ResetPasswordRequest'];
export type UpdateMeRequest = Schemas['UpdateMeRequest'];

export type Organization = Schemas['Organization'];
export type UpdateOrganizationRequest = Schemas['UpdateOrganizationRequest'];

export type Member = Schemas['Member'];
export type MemberPage = Schemas['MemberPage'];
export type ChangeMemberRoleRequest = Schemas['ChangeMemberRoleRequest'];

export type Invitation = Schemas['Invitation'];
export type InvitationPage = Schemas['InvitationPage'];
export type CreateInvitationRequest = Schemas['CreateInvitationRequest'];
export type InvitationPreview = Schemas['InvitationPreview'];
export type AcceptInvitationRequest = Schemas['AcceptInvitationRequest'];

export type ProblemDetail = Schemas['Problem'];
export type ProblemFieldError = Schemas['FieldError'];

/** Query parameters of list operations, straight from the contract. */
export type ListMembersQuery = NonNullable<operations['listMembers']['parameters']['query']>;
export type ListInvitationsQuery = NonNullable<
  operations['listInvitations']['parameters']['query']
>;

/** Offset pagination (page is 0-based). */
export type Page<T> = Schemas['PageMetadata'] & { content: T[] };

/** Runtime lists of enum values; `satisfies` keeps them in sync with the contract's unions. */
export const ROLES = [
  'ORG_ADMIN',
  'PMO',
  'PROJECT_MANAGER',
  'MEMBER',
  'VIEWER',
] as const satisfies readonly Role[];

export const LOCALES = ['en', 'fr', 'rw'] as const satisfies readonly Locale[];

export const INVITATION_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'REVOKED',
  'EXPIRED',
] as const satisfies readonly InvitationStatus[];

/** Sort fields the API accepts (anything else is `400 validation.failed` on `sort`). */
export const MEMBER_SORT_FIELDS = ['fullName', 'email', 'role', 'joinedAt'] as const;
export const INVITATION_SORT_FIELDS = ['createdAt', 'expiresAt', 'email'] as const;

// ---------- Contract 0.2.0: portfolios, projects, charter, WBS, dashboard ----------

export type Money = Schemas['Money'];
export type UserRef = Schemas['UserRef'];
export type Health = Schemas['Health'];

export type PortfolioStatus = Schemas['PortfolioStatus'];
export type Portfolio = Schemas['Portfolio'];
export type PortfolioPage = Schemas['PortfolioPage'];
export type CreatePortfolioRequest = Schemas['CreatePortfolioRequest'];
export type UpdatePortfolioRequest = Schemas['UpdatePortfolioRequest'];
export type ProgramStatus = Schemas['ProgramStatus'];
export type Program = Schemas['Program'];
export type CreateProgramRequest = Schemas['CreateProgramRequest'];
export type UpdateProgramRequest = Schemas['UpdateProgramRequest'];

export type Methodology = Schemas['Methodology'];
export type ProjectStatus = Schemas['ProjectStatus'];
export type Project = Schemas['Project'];
export type ProjectPage = Schemas['ProjectPage'];
export type CreateProjectRequest = Schemas['CreateProjectRequest'];
export type UpdateProjectRequest = Schemas['UpdateProjectRequest'];
export type TransitionRequest = Schemas['TransitionRequest'];
export type HealthOverrideRequest = Schemas['HealthOverrideRequest'];
export type ProjectRole = Schemas['ProjectRole'];
export type ProjectMember = Schemas['ProjectMember'];
export type PutProjectMemberRequest = Schemas['PutProjectMemberRequest'];

export type CharterStatus = Schemas['CharterStatus'];
export type CharterObjective = Schemas['CharterObjective'];
export type CharterMilestone = Schemas['CharterMilestone'];
export type CharterContent = Schemas['CharterContent'];
export type Charter = Schemas['Charter'];

export type WbsNodeType = Schemas['WbsNodeType'];
export type WbsNode = Schemas['WbsNode'];
export type WbsTree = Schemas['WbsTree'];
export type CreateWbsNodeRequest = Schemas['CreateWbsNodeRequest'];
export type UpdateWbsNodeRequest = Schemas['UpdateWbsNodeRequest'];
export type MoveWbsNodeRequest = Schemas['MoveWbsNodeRequest'];

export type TaskStatus = Schemas['TaskStatus'];
export type TaskType = Schemas['TaskType'];
export type TaskPriority = Schemas['TaskPriority'];
export type Task = Schemas['Task'];
export type TaskPage = Schemas['TaskPage'];
export type CreateTaskRequest = Schemas['CreateTaskRequest'];
export type UpdateTaskRequest = Schemas['UpdateTaskRequest'];
export type MoveTaskRequest = Schemas['MoveTaskRequest'];
export type TaskComment = Schemas['TaskComment'];
export type BoardColumn = Schemas['BoardColumn'];
export type BoardColumnSettings = Schemas['BoardColumnSettings'];
export type Board = Schemas['Board'];

export type SprintStatus = Schemas['SprintStatus'];
export type Sprint = Schemas['Sprint'];
export type CreateSprintRequest = Schemas['CreateSprintRequest'];
export type UpdateSprintRequest = Schemas['UpdateSprintRequest'];
export type Burndown = Schemas['Burndown'];
export type BurndownDay = Schemas['BurndownDay'];
export type Velocity = Schemas['Velocity'];

export type ScheduleConstraint = Schemas['ScheduleConstraint'];
export type DependencyType = Schemas['DependencyType'];
export type Dependency = Schemas['Dependency'];
export type CreateDependencyRequest = Schemas['CreateDependencyRequest'];
export type ScheduledTask = Schemas['ScheduledTask'];
export type Schedule = Schemas['Schedule'];
export type Baseline = Schemas['Baseline'];
export type DayOfWeek = Schemas['DayOfWeek'];
export type Holiday = Schemas['Holiday'];
export type WorkingCalendar = Schemas['WorkingCalendar'];
export type UpdateWorkingCalendarRequest = Schemas['UpdateWorkingCalendarRequest'];

export type DashboardSummary = Schemas['DashboardSummary'];
export type DashboardProject = Schemas['DashboardProject'];
export type DashboardProjectPage = Schemas['DashboardProjectPage'];

export type ListPortfoliosQuery = NonNullable<operations['listPortfolios']['parameters']['query']>;
export type ListProjectsQuery = NonNullable<operations['listProjects']['parameters']['query']>;
export type ListTasksQuery = NonNullable<operations['listTasks']['parameters']['query']>;
export type BacklogQuery = NonNullable<operations['getBacklog']['parameters']['query']>;
export type ListDashboardProjectsQuery = NonNullable<
  operations['listDashboardProjects']['parameters']['query']
>;

export const HEALTHS = ['RED', 'AMBER', 'GREEN', 'GREY'] as const satisfies readonly Health[];
export const METHODOLOGIES = [
  'AGILE',
  'PREDICTIVE',
  'HYBRID',
] as const satisfies readonly Methodology[];
export const PROJECT_STATUSES = [
  'PROPOSED',
  'APPROVED',
  'IN_PROGRESS',
  'ON_HOLD',
  'CLOSING',
  'CLOSED',
  'CANCELLED',
] as const satisfies readonly ProjectStatus[];
export const PORTFOLIO_SORT_FIELDS = ['name', 'createdAt'] as const;
export const PROJECT_SORT_FIELDS = [
  'code',
  'name',
  'status',
  'startDate',
  'targetEndDate',
] as const;
export const DASHBOARD_SORT_FIELDS = ['code', 'name', 'percentComplete', 'targetEndDate'] as const;
/** Transitions that need a reason (400 on `reason` otherwise). */
export const TRANSITIONS_NEEDING_REASON: readonly ProjectStatus[] = ['ON_HOLD', 'CANCELLED'];
/** The WBS is at most this many levels deep (409 `wbs.too_deep`). */
export const WBS_MAX_DEPTH = 8;

export const TASK_STATUSES = [
  'BACKLOG',
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'IN_REVIEW',
  'DONE',
] as const satisfies readonly TaskStatus[];
/** The board's columns, left to right: every status except the backlog. */
export const BOARD_STATUSES = [
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'IN_REVIEW',
  'DONE',
] as const satisfies readonly TaskStatus[];
export type BoardStatus = (typeof BOARD_STATUSES)[number];
export const TASK_TYPES = ['STORY', 'TASK', 'BUG', 'CHORE'] as const satisfies readonly TaskType[];
export const TASK_PRIORITIES = [
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
] as const satisfies readonly TaskPriority[];
/** `carryOverTo` value that sends unfinished tasks back to the backlog when a sprint closes. */
export const CARRY_OVER_TO_BACKLOG = 'BACKLOG';

export const DEPENDENCY_TYPES = [
  'FS',
  'SS',
  'FF',
  'SF',
] as const satisfies readonly DependencyType[];
export const DAYS_OF_WEEK = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const satisfies readonly DayOfWeek[];
