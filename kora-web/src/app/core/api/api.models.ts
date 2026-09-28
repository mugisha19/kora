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

export type RiskKind = Schemas['RiskKind'];
export type RiskCategory = Schemas['RiskCategory'];
export type RiskProximity = Schemas['RiskProximity'];
export type RiskStatus = Schemas['RiskStatus'];
export type ResponseStrategy = Schemas['ResponseStrategy'];
export type Severity = Schemas['Severity'];
export type RiskClosure = Schemas['RiskClosure'];
export type Risk = Schemas['Risk'];
export type RiskPage = Schemas['RiskPage'];
export type CreateRiskRequest = Schemas['CreateRiskRequest'];
export type UpdateRiskRequest = Schemas['UpdateRiskRequest'];
export type RiskAssessment = Schemas['RiskAssessment'];
export type AssessRiskRequest = Schemas['AssessRiskRequest'];
export type MaterializeRiskRequest = Schemas['MaterializeRiskRequest'];
export type RiskHeatmapCell = Schemas['RiskHeatmapCell'];
export type RiskHeatmap = Schemas['RiskHeatmap'];

export type IssueType = Schemas['IssueType'];
export type IssuePriority = Schemas['IssuePriority'];
export type IssueStatus = Schemas['IssueStatus'];
export type Issue = Schemas['Issue'];
export type IssuePage = Schemas['IssuePage'];
export type CreateIssueRequest = Schemas['CreateIssueRequest'];
export type UpdateIssueRequest = Schemas['UpdateIssueRequest'];

export type Engagement = Schemas['Engagement'];
export type StakeholderQuadrant = Schemas['StakeholderQuadrant'];
export type Stakeholder = Schemas['Stakeholder'];
export type StakeholderPage = Schemas['StakeholderPage'];
export type CreateStakeholderRequest = Schemas['CreateStakeholderRequest'];
export type UpdateStakeholderRequest = Schemas['UpdateStakeholderRequest'];
export type StakeholderGridEntry = Schemas['StakeholderGridEntry'];
export type StakeholderGrid = Schemas['StakeholderGrid'];

export type ChangeRequestType = Schemas['ChangeRequestType'];
export type ChangeRequestStatus = Schemas['ChangeRequestStatus'];
export type ChangeImpact = Schemas['ChangeImpact'];
export type ApprovalLevel = Schemas['ApprovalLevel'];
export type ApprovalStep = Schemas['ApprovalStep'];
export type Decision = Schemas['Decision'];
export type ChangeRequest = Schemas['ChangeRequest'];
export type ChangeRequestPage = Schemas['ChangeRequestPage'];
export type CreateChangeRequestRequest = Schemas['CreateChangeRequestRequest'];
export type UpdateChangeRequestRequest = Schemas['UpdateChangeRequestRequest'];
export type DecisionRequest = Schemas['DecisionRequest'];
export type ChangeControlSettings = Schemas['ChangeControlSettings'];
export type UpdateChangeControlSettingsRequest = Schemas['UpdateChangeControlSettingsRequest'];

export type TimesheetStatus = Schemas['TimesheetStatus'];
export type TimesheetEntry = Schemas['TimesheetEntry'];
export type TimesheetEntryInput = Schemas['TimesheetEntryInput'];
export type TimesheetSummary = Schemas['TimesheetSummary'];
export type Timesheet = Schemas['Timesheet'];
export type TimesheetPage = Schemas['TimesheetPage'];
export type TimesheetWeek = Schemas['TimesheetWeek'];
export type CostRate = Schemas['CostRate'];
export type CreateCostRateRequest = Schemas['CreateCostRateRequest'];

export type UtilizationBand = Schemas['UtilizationBand'];
export type ResourceWeek = Schemas['ResourceWeek'];
export type ResourceRow = Schemas['ResourceRow'];
export type ResourceHeatmap = Schemas['ResourceHeatmap'];
export type Allocation = Schemas['Allocation'];
export type AllocationInput = Schemas['AllocationInput'];
export type Capacity = Schemas['Capacity'];
export type Leave = Schemas['Leave'];
export type UpdateCapacityRequest = Schemas['UpdateCapacityRequest'];
export type CreateLeaveRequest = Schemas['CreateLeaveRequest'];

export type PercentCompleteMethod = Schemas['PercentCompleteMethod'];
export type EacMethod = Schemas['EacMethod'];
export type EvmSettings = Schemas['EvmSettings'];
export type UpdateEvmSettingsRequest = Schemas['UpdateEvmSettingsRequest'];
export type EvmReport = Schemas['EvmReport'];
export type EvmPoint = Schemas['EvmPoint'];
export type EvmSeries = Schemas['EvmSeries'];
export type DashboardTrends = Schemas['DashboardTrends'];
export type DashboardTrendMonth = Schemas['DashboardTrendMonth'];

export type NotificationType = Schemas['NotificationType'];
export type AppNotification = Schemas['Notification'];
export type NotificationPage = Schemas['NotificationPage'];
export type NotificationPreference = Schemas['NotificationPreference'];
export type NotificationPreferences = Schemas['NotificationPreferences'];
export type ActivityEntry = Schemas['ActivityEntry'];
export type ActivityPage = Schemas['ActivityPage'];
export type AuditOutcome = Schemas['AuditOutcome'];
export type FieldChange = Schemas['FieldChange'];
export type AuditEvent = Schemas['AuditEvent'];
export type AuditPage = Schemas['AuditPage'];
export type AuditVerification = Schemas['AuditVerification'];
export type AttachmentOwnerType = Schemas['AttachmentOwnerType'];
export type AttachmentStatus = Schemas['AttachmentStatus'];
export type ScanStatus = Schemas['ScanStatus'];
export type Attachment = Schemas['Attachment'];
export type StartUploadRequest = Schemas['StartUploadRequest'];
export type AttachmentUpload = Schemas['AttachmentUpload'];
export type AttachmentDownload = Schemas['AttachmentDownload'];
export type ReportType = Schemas['ReportType'];
export type ReportFormat = Schemas['ReportFormat'];
export type ReportStatus = Schemas['ReportStatus'];
export type ReportParams = Schemas['ReportParams'];
export type CreateReportRequest = Schemas['CreateReportRequest'];
export type ReportJob = Schemas['ReportJob'];

export type DashboardSummary = Schemas['DashboardSummary'];
export type DashboardProject = Schemas['DashboardProject'];
export type DashboardProjectPage = Schemas['DashboardProjectPage'];

export type ListPortfoliosQuery = NonNullable<operations['listPortfolios']['parameters']['query']>;
export type ListProjectsQuery = NonNullable<operations['listProjects']['parameters']['query']>;
export type ListTasksQuery = NonNullable<operations['listTasks']['parameters']['query']>;
export type ListRisksQuery = NonNullable<operations['listRisks']['parameters']['query']>;
export type RiskHeatmapQuery = NonNullable<operations['getRiskHeatmap']['parameters']['query']>;
export type ListPortfolioRisksQuery = NonNullable<
  operations['listPortfolioRisks']['parameters']['query']
>;
export type ListIssuesQuery = NonNullable<operations['listIssues']['parameters']['query']>;
export type ListStakeholdersQuery = NonNullable<
  operations['listStakeholders']['parameters']['query']
>;
export type ListChangeRequestsQuery = NonNullable<
  operations['listChangeRequests']['parameters']['query']
>;
export type ListProjectTimesheetsQuery = NonNullable<
  operations['listProjectTimesheets']['parameters']['query']
>;
export type ListNotificationsQuery = NonNullable<
  operations['listNotifications']['parameters']['query']
>;
export type ListAuditEventsQuery = NonNullable<
  operations['listAuditEvents']['parameters']['query']
>;
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

export const RISK_KINDS = ['THREAT', 'OPPORTUNITY'] as const satisfies readonly RiskKind[];
export const RISK_CATEGORIES = [
  'TECHNICAL',
  'EXTERNAL',
  'ORGANIZATIONAL',
  'PROJECT_MANAGEMENT',
  'FINANCIAL',
  'OTHER',
] as const satisfies readonly RiskCategory[];
export const RISK_PROXIMITIES = [
  'IMMEDIATE',
  'WEEKS',
  'MONTHS',
  'LATER',
] as const satisfies readonly RiskProximity[];
export const RISK_STATUSES = [
  'IDENTIFIED',
  'ANALYZED',
  'RESPONSE_PLANNED',
  'MONITORING',
  'CLOSED',
] as const satisfies readonly RiskStatus[];
/** The strategies each kind of risk allows (another kind's strategy is refused on responseStrategy). */
export const RESPONSE_STRATEGIES: Record<RiskKind, readonly ResponseStrategy[]> = {
  THREAT: ['AVOID', 'MITIGATE', 'TRANSFER', 'ACCEPT', 'ESCALATE'],
  OPPORTUNITY: ['EXPLOIT', 'ENHANCE', 'SHARE', 'ACCEPT', 'ESCALATE'],
};
/** Statuses that need a response strategy and plan. */
export const RISK_STATUSES_NEEDING_RESPONSE: readonly RiskStatus[] = [
  'RESPONSE_PLANNED',
  'MONITORING',
];
export const RISK_SORT_FIELDS = ['score', 'key', 'reviewDate', 'createdAt'] as const;
export const SEVERITIES = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
] as const satisfies readonly Severity[];

export const ISSUE_TYPES = [
  'TECHNICAL',
  'RESOURCE',
  'SCOPE',
  'VENDOR',
  'OTHER',
] as const satisfies readonly IssueType[];
export const ISSUE_PRIORITIES = [
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
] as const satisfies readonly IssuePriority[];
export const ISSUE_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'RESOLVED',
  'CLOSED',
] as const satisfies readonly IssueStatus[];
export const ISSUE_SORT_FIELDS = ['priority', 'dueDate', 'key', 'createdAt'] as const;

/** Least to most engaged. */
export const ENGAGEMENTS = [
  'UNAWARE',
  'RESISTANT',
  'NEUTRAL',
  'SUPPORTIVE',
  'LEADING',
] as const satisfies readonly Engagement[];
export const STAKEHOLDER_QUADRANTS = [
  'MANAGE_CLOSELY',
  'KEEP_SATISFIED',
  'KEEP_INFORMED',
  'MONITOR',
] as const satisfies readonly StakeholderQuadrant[];

export const CHANGE_REQUEST_TYPES = [
  'SCOPE',
  'SCHEDULE',
  'COST',
  'QUALITY',
  'OTHER',
] as const satisfies readonly ChangeRequestType[];
export const CHANGE_REQUEST_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
  'IMPLEMENTED',
] as const satisfies readonly ChangeRequestStatus[];

export const TIMESHEET_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
] as const satisfies readonly TimesheetStatus[];
export const PERCENT_COMPLETE_METHODS = [
  'PHYSICAL',
  'ZERO_HUNDRED',
  'FIFTY_FIFTY',
  'STORY_POINTS',
] as const satisfies readonly PercentCompleteMethod[];
export const EAC_METHODS = [
  'TYPICAL',
  'ATYPICAL',
  'COMPOSITE',
] as const satisfies readonly EacMethod[];
/** The heat map covers at most this many weeks. */
export const HEATMAP_MAX_WEEKS = 26;

export const NOTIFICATION_TYPES = [
  'TASK_ASSIGNED',
  'APPROVAL_REQUESTED',
  'CHANGE_REQUEST_DECIDED',
  'TIMESHEET_DECIDED',
  'RISK_REVIEW_OVERDUE',
  'ISSUE_ESCALATED',
  'REPORT_READY',
  'REPORT_FAILED',
] as const satisfies readonly NotificationType[];
export const ATTACHMENT_OWNER_TYPES = [
  'PROJECT',
  'TASK',
  'RISK',
  'ISSUE',
  'CHANGE_REQUEST',
] as const satisfies readonly AttachmentOwnerType[];
/** The API refuses bigger files (25 MB). */
export const ATTACHMENT_MAX_BYTES = 26_214_400;
/** File types the API accepts, by extension, with the content type to declare. */
export const ATTACHMENT_TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain',
  csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
export const REPORT_TYPES = [
  'PROJECT_STATUS',
  'PORTFOLIO_SUMMARY',
  'RISK_REGISTER',
  'EVM',
  'TIMESHEETS',
] as const satisfies readonly ReportType[];
export const REPORT_FORMATS = ['PDF', 'XLSX'] as const satisfies readonly ReportFormat[];
/** At most this many of my reports may wait (QUEUED or RUNNING) at once. */
export const REPORTS_MAX_PENDING = 5;
