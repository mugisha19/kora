import {
  ApprovalLevel,
  ChangeImpact,
  ChangeRequestStatus,
  ChangeRequestType,
  Engagement,
  IssuePriority,
  IssueStatus,
  IssueType,
  ResponseStrategy,
  RiskCategory,
  RiskClosure,
  RiskKind,
  RiskProximity,
  RiskStatus,
  Role,
} from '../core/api/api.models';
import { USER } from './data';
import { PEOPLE, PROJECT } from './data-projects';

/**
 * Phase 7 demo data (features 11–14): the mobile banking app carries a full governance story —
 * critical risks with plans, an overdue review, a risk that materialized into an escalated issue,
 * stakeholders across the power/interest grid with engagement gaps, and change requests at every
 * stage (one waiting for the PMO, one for the project manager, one rejected, one implemented).
 * The warehouse and ERP projects have a few entries so the portfolio view has something to show.
 * All fictional.
 */

export interface RiskRecord {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description?: string;
  category: RiskCategory;
  proximity?: RiskProximity;
  ownerId?: string;
  responseStrategy?: ResponseStrategy;
  responsePlan?: string;
  triggerConditions?: string;
  reviewDate?: string;
  kind: RiskKind;
  status: RiskStatus;
  probability: number;
  impact: number;
  residualProbability?: number;
  residualImpact?: number;
  identifiedById: string;
  closure?: RiskClosure;
  closureNote?: string;
  issueId?: string;
  createdAt: string;
  version: number;
}

export interface RiskAssessmentRecord {
  id: string;
  riskId: string;
  probability: number;
  impact: number;
  residualProbability?: number;
  residualImpact?: number;
  note?: string;
  assessedById: string;
  assessedAt: string;
}

export interface IssueRecord {
  id: string;
  projectId: string;
  number: number;
  title: string;
  description?: string;
  type: IssueType;
  priority: IssuePriority;
  status: IssueStatus;
  ownerId?: string;
  raisedById: string;
  dueDate?: string;
  resolution?: string;
  resolvedAt?: string;
  riskId?: string;
  changeRequestId?: string;
  createdAt: string;
  version: number;
}

export interface StakeholderRecord {
  id: string;
  projectId: string;
  name: string;
  organization?: string;
  role?: string;
  email?: string;
  phone?: string;
  userId?: string;
  power: number;
  interest: number;
  influence?: number;
  currentEngagement: Engagement;
  desiredEngagement: Engagement;
  communicationPreferences?: string;
  notes?: string;
  removed: boolean;
  version: number;
}

export interface ApprovalStepRecord {
  position: number;
  level: ApprovalLevel;
  reason: string;
  approverId?: string;
  approverRole?: Role;
  state: 'WAITING' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED';
  decidedById?: string;
  comment?: string;
  decidedAt?: string;
}

export interface ChangeRequestRecord {
  id: string;
  projectId: string;
  number: number;
  revision: number;
  title: string;
  description?: string;
  reason: string;
  type: ChangeRequestType;
  status: ChangeRequestStatus;
  impact: ChangeImpact;
  requestedById: string;
  issueId?: string;
  previousRevisionId?: string;
  steps: ApprovalStepRecord[];
  submittedAt?: string;
  decidedAt?: string;
  createdAt: string;
  version: number;
}

export interface ChangeControlRecord {
  organizationId: string;
  pmoCostPercent: number;
  pmoScheduleDays: number;
  sponsorCostPercent: number;
  version: number;
}

export interface GovernanceSeed {
  risks: RiskRecord[];
  riskAssessments: RiskAssessmentRecord[];
  issues: IssueRecord[];
  stakeholders: StakeholderRecord[];
  changeRequests: ChangeRequestRecord[];
  changeControls: ChangeControlRecord[];
}

const DAY = 86_400_000;
const id = (prefix: string, n: number) =>
  `${prefix}-0000-4000-8000-${n.toString().padStart(12, '0')}`;

export const RISK = (n: number) => id('8a1b2c3d', n);
export const ISSUE = (n: number) => id('8b1b2c3d', n);
export const STAKEHOLDER = (n: number) => id('8c1b2c3d', n);
export const CHANGE_REQUEST = (n: number) => id('8d1b2c3d', n);
const ASSESSMENT = (n: number) => id('8a2b2c3d', n);

const rwf = (amount: string) => ({ amount, currency: 'RWF' });

export function createGovernanceSeed(now: number): GovernanceSeed {
  const at = (days: number) => new Date(now + days * DAY).toISOString();
  const date = (days: number) => at(days).slice(0, 10);

  let riskNo = 0;
  const risk = (
    projectKey: keyof typeof PROJECT,
    number: number,
    fields: Omit<RiskRecord, 'id' | 'projectId' | 'number' | 'version' | 'identifiedById'> & {
      identifiedById?: string;
    },
  ): RiskRecord => ({
    id: RISK(++riskNo),
    projectId: PROJECT[projectKey],
    number,
    identifiedById: USER.pm,
    version: 1,
    ...fields,
  });

  const risks: RiskRecord[] = [
    risk('mobile', 1, {
      title: 'App store review rejects the release',
      description: 'Both stores tightened their review of banking apps this year.',
      kind: 'THREAT',
      category: 'EXTERNAL',
      proximity: 'WEEKS',
      probability: 4,
      impact: 4,
      residualProbability: 2,
      residualImpact: 3,
      status: 'RESPONSE_PLANNED',
      ownerId: USER.pm,
      responseStrategy: 'MITIGATE',
      responsePlan: 'Run the stores’ pre-submission checklist; submit a beta two weeks early.',
      triggerConditions: 'A rejection of the beta build',
      reviewDate: date(5),
      createdAt: at(-40),
    }),
    risk('mobile', 2, {
      title: 'Core banking API rate limits under peak load',
      kind: 'THREAT',
      category: 'TECHNICAL',
      proximity: 'MONTHS',
      probability: 3,
      impact: 5,
      status: 'ANALYZED',
      ownerId: USER.member,
      reviewDate: date(10),
      identifiedById: USER.member,
      createdAt: at(-3),
    }),
    risk('mobile', 3, {
      title: 'The only Android developer leaves',
      kind: 'THREAT',
      category: 'ORGANIZATIONAL',
      proximity: 'MONTHS',
      probability: 2,
      impact: 4,
      residualProbability: 2,
      residualImpact: 2,
      status: 'MONITORING',
      ownerId: USER.pm,
      responseStrategy: 'MITIGATE',
      responsePlan: 'Pair programming and a documented build; a second developer learns Kotlin.',
      reviewDate: date(20),
      createdAt: at(-90),
    }),
    risk('mobile', 4, {
      title: 'A partner bank offers joint marketing at launch',
      kind: 'OPPORTUNITY',
      category: 'EXTERNAL',
      proximity: 'WEEKS',
      probability: 3,
      impact: 3,
      status: 'RESPONSE_PLANNED',
      ownerId: USER.pm,
      responseStrategy: 'EXPLOIT',
      responsePlan: 'Agree a launch campaign with the partner’s marketing team.',
      reviewDate: date(12),
      createdAt: at(-15),
    }),
    risk('mobile', 5, {
      title: 'The security audit finds critical issues late',
      kind: 'THREAT',
      category: 'TECHNICAL',
      proximity: 'WEEKS',
      probability: 3,
      impact: 4,
      status: 'IDENTIFIED',
      ownerId: USER.member,
      reviewDate: date(-3),
      identifiedById: USER.member,
      createdAt: at(-25),
    }),
    risk('mobile', 6, {
      title: 'The designer is unavailable in sprint 3',
      kind: 'THREAT',
      category: 'ORGANIZATIONAL',
      probability: 2,
      impact: 2,
      status: 'CLOSED',
      closure: 'EXPIRED',
      closureNote: 'Sprint 3 finished with the designer on the team.',
      ownerId: USER.pm,
      createdAt: at(-70),
    }),
    risk('mobile', 7, {
      title: 'The push notification provider has an outage',
      kind: 'THREAT',
      category: 'EXTERNAL',
      probability: 2,
      impact: 3,
      status: 'CLOSED',
      closure: 'MATERIALIZED',
      closureNote: 'It happened: see the linked issue.',
      issueId: ISSUE(2),
      ownerId: USER.pm,
      createdAt: at(-50),
    }),
    risk('warehouse', 1, {
      title: 'Source systems have no data owners',
      kind: 'THREAT',
      category: 'ORGANIZATIONAL',
      probability: 3,
      impact: 3,
      status: 'IDENTIFIED',
      ownerId: USER.pm,
      reviewDate: date(14),
      createdAt: at(-10),
    }),
    risk('warehouse', 2, {
      title: 'Legal approval of data access takes longer than planned',
      kind: 'THREAT',
      category: 'PROJECT_MANAGEMENT',
      probability: 4,
      impact: 3,
      status: 'MONITORING',
      ownerId: USER.pm,
      responseStrategy: 'MITIGATE',
      responsePlan: 'Start the legal review before the design is finished.',
      reviewDate: date(7),
      createdAt: at(-12),
    }),
    risk('erp', 1, {
      title: 'Data migration errors in the opening balances',
      kind: 'THREAT',
      category: 'FINANCIAL',
      proximity: 'MONTHS',
      probability: 4,
      impact: 5,
      residualProbability: 2,
      residualImpact: 4,
      status: 'RESPONSE_PLANNED',
      ownerId: PEOPLE.alice,
      identifiedById: PEOPLE.alice,
      responseStrategy: 'MITIGATE',
      responsePlan: 'Trial migrations every month, with a reconciliation signed off by finance.',
      reviewDate: date(10),
      createdAt: at(-60),
    }),
  ];

  // Every risk's first assessment is recorded with it; three were re-scored since.
  const history: Record<number, [number, number, number, string][]> = {
    1: [
      [-40, 3, 4, 'First assessment'],
      [-20, 4, 4, 'Both stores tightened their review of banking apps'],
    ],
    5: [
      [-25, 2, 3, 'First assessment'],
      [-10, 3, 4, 'The audit firm moved its start date'],
    ],
    10: [
      [-60, 3, 5, 'First assessment'],
      [-30, 4, 5, 'The legacy balances don’t reconcile'],
    ],
  };
  let assessmentNo = 0;
  const riskAssessments: RiskAssessmentRecord[] = risks.flatMap((r, index) => {
    const steps = history[index + 1];
    if (!steps) {
      return [
        {
          id: ASSESSMENT(++assessmentNo),
          riskId: r.id,
          probability: r.probability,
          impact: r.impact,
          ...(r.residualProbability ? { residualProbability: r.residualProbability } : {}),
          ...(r.residualImpact ? { residualImpact: r.residualImpact } : {}),
          note: 'First assessment',
          assessedById: r.identifiedById,
          assessedAt: r.createdAt,
        },
      ];
    }
    return steps.map(([days, probability, impact, note], i) => ({
      id: ASSESSMENT(++assessmentNo),
      riskId: r.id,
      probability,
      impact,
      // The latest assessment is the risk's current one, residual scores included.
      ...(i === steps.length - 1 && r.residualProbability
        ? { residualProbability: r.residualProbability }
        : {}),
      ...(i === steps.length - 1 && r.residualImpact ? { residualImpact: r.residualImpact } : {}),
      note,
      assessedById: r.ownerId ?? r.identifiedById,
      assessedAt: at(days),
    }));
  });

  let issueNo = 0;
  const issue = (
    projectKey: keyof typeof PROJECT,
    number: number,
    fields: Omit<IssueRecord, 'id' | 'projectId' | 'number' | 'version' | 'raisedById'> & {
      raisedById?: string;
    },
  ): IssueRecord => ({
    id: ISSUE(++issueNo),
    projectId: PROJECT[projectKey],
    number,
    raisedById: USER.pm,
    version: 1,
    ...fields,
  });

  const issues: IssueRecord[] = [
    issue('mobile', 1, {
      title: 'Sign-in fails on Android 10 devices',
      description: 'The biometric prompt crashes on some Samsung phones running Android 10.',
      type: 'TECHNICAL',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      ownerId: USER.member,
      raisedById: USER.member,
      dueDate: date(2),
      createdAt: at(-4),
    }),
    issue('mobile', 2, {
      title: 'Push notifications arrive up to an hour late',
      description: 'The provider’s European region is degraded; transfers confirm late.',
      type: 'VENDOR',
      priority: 'CRITICAL',
      status: 'OPEN',
      ownerId: USER.pm,
      dueDate: date(-1),
      riskId: RISK(7),
      createdAt: at(-5),
    }),
    issue('mobile', 3, {
      title: 'The test device budget is used up',
      type: 'RESOURCE',
      priority: 'MEDIUM',
      status: 'RESOLVED',
      ownerId: USER.pm,
      resolution: 'Borrowed six devices from the QA pool until the next quarter.',
      resolvedAt: at(-6),
      createdAt: at(-14),
    }),
    issue('mobile', 4, {
      title: 'Bill payments were never scoped',
      description: 'Customers expect utility bills in the first release; the charter left it out.',
      type: 'SCOPE',
      priority: 'HIGH',
      status: 'OPEN',
      ownerId: USER.pm,
      raisedById: USER.member,
      dueDate: date(7),
      changeRequestId: CHANGE_REQUEST(2),
      createdAt: at(-9),
    }),
    issue('mobile', 5, {
      title: 'Typo in the French onboarding screen',
      type: 'OTHER',
      priority: 'LOW',
      status: 'CLOSED',
      ownerId: USER.member,
      raisedById: USER.member,
      resolution: 'Fixed in build 142.',
      resolvedAt: at(-20),
      createdAt: at(-22),
    }),
    issue('warehouse', 1, {
      title: 'The finance system has no export API',
      type: 'TECHNICAL',
      priority: 'HIGH',
      status: 'OPEN',
      ownerId: USER.pm,
      dueDate: date(20),
      createdAt: at(-2),
    }),
  ];

  let stakeholderNo = 0;
  const stakeholder = (
    projectKey: keyof typeof PROJECT,
    fields: Omit<StakeholderRecord, 'id' | 'projectId' | 'version' | 'removed'>,
  ): StakeholderRecord => ({
    id: STAKEHOLDER(++stakeholderNo),
    projectId: PROJECT[projectKey],
    removed: false,
    version: 1,
    ...fields,
  });

  const stakeholders: StakeholderRecord[] = [
    stakeholder('mobile', {
      name: 'Jean-Paul Habimana',
      organization: 'Akagera Bank',
      role: 'Chief executive officer',
      email: 'jp.habimana@akagera-bank.example',
      power: 5,
      interest: 3,
      influence: 5,
      currentEngagement: 'SUPPORTIVE',
      desiredEngagement: 'LEADING',
      communicationPreferences: 'Monthly one-page summary; a demo before launch',
    }),
    stakeholder('mobile', {
      name: 'National Bank of Rwanda',
      organization: 'Regulator',
      role: 'Payment systems supervision',
      power: 5,
      interest: 2,
      influence: 4,
      currentEngagement: 'NEUTRAL',
      desiredEngagement: 'NEUTRAL',
      communicationPreferences: 'Formal letters through compliance',
    }),
    stakeholder('mobile', {
      name: 'Claudine Uwimana',
      organization: 'Akagera Bank',
      role: 'IT security officer',
      email: 'c.uwimana@akagera-bank.example',
      phone: '+250 788 123 456',
      power: 4,
      interest: 5,
      influence: 4,
      currentEngagement: 'LEADING',
      desiredEngagement: 'LEADING',
    }),
    stakeholder('mobile', {
      name: 'Retail customers panel',
      role: 'Twelve customers who test new features',
      power: 2,
      interest: 5,
      influence: 3,
      currentEngagement: 'NEUTRAL',
      desiredEngagement: 'SUPPORTIVE',
      communicationPreferences: 'Beta builds and a short survey every sprint',
    }),
    stakeholder('mobile', {
      name: 'Eric Nshimiyimana',
      organization: 'Akagera Bank',
      role: 'Call centre team lead',
      email: 'e.nshimiyimana@akagera-bank.example',
      power: 2,
      interest: 2,
      influence: 2,
      currentEngagement: 'RESISTANT',
      desiredEngagement: 'NEUTRAL',
      notes: 'Worried the app will cut call centre jobs; involve the team in support planning.',
    }),
    stakeholder('mobile', {
      name: 'Odette Mukamurenzi',
      organization: 'Akagera Digital',
      role: 'Marketing lead',
      userId: PEOPLE.odette,
      power: 3,
      interest: 4,
      influence: 3,
      currentEngagement: 'UNAWARE',
      desiredEngagement: 'SUPPORTIVE',
    }),
    stakeholder('warehouse', {
      name: 'Finance director',
      organization: 'Akagera Digital',
      power: 4,
      interest: 4,
      currentEngagement: 'SUPPORTIVE',
      desiredEngagement: 'LEADING',
    }),
  ];

  const pmStep = (state: ApprovalStepRecord['state'], extra: Partial<ApprovalStepRecord> = {}) => ({
    position: 1,
    level: 'PROJECT_MANAGER' as const,
    reason: 'The project manager confirms the impact analysis',
    approverId: USER.pm,
    state,
    ...extra,
  });

  const changeRequests: ChangeRequestRecord[] = [
    {
      id: CHANGE_REQUEST(1),
      projectId: PROJECT.mobile,
      number: 1,
      revision: 1,
      title: 'Add fingerprint sign-in',
      reason: 'Customers asked for it in the first beta survey.',
      type: 'SCOPE',
      status: 'IMPLEMENTED',
      impact: {
        costDelta: rwf('2000000'),
        scheduleDeltaDays: 3,
        scopeSummary: 'Fingerprint and face sign-in on supported phones',
        changesCharterScope: false,
      },
      requestedById: USER.member,
      steps: [
        pmStep('APPROVED', {
          decidedById: USER.pm,
          comment: 'Small and worth it.',
          decidedAt: at(-44),
        }),
      ],
      submittedAt: at(-46),
      decidedAt: at(-44),
      createdAt: at(-47),
      version: 4,
    },
    {
      id: CHANGE_REQUEST(2),
      projectId: PROJECT.mobile,
      number: 2,
      revision: 1,
      title: 'Add utility bill payments',
      description: 'Electricity and water bills through the national payment switch.',
      reason:
        'The most requested feature; the charter left bill payments out of the first release.',
      type: 'SCOPE',
      status: 'IN_REVIEW',
      impact: {
        costDelta: rwf('12000000'),
        scheduleDeltaDays: 8,
        scopeSummary: 'Utility bill payments (electricity and water)',
        riskSummary: 'A new integration with the payment switch; its test environment is shared.',
        changesCharterScope: true,
      },
      requestedById: USER.member,
      issueId: ISSUE(4),
      steps: [
        pmStep('APPROVED', {
          decidedById: USER.pm,
          comment: 'Impact analysis checked with the team.',
          decidedAt: at(-2),
        }),
        {
          position: 2,
          level: 'PMO',
          reason: 'Cost change of 8% of the budget exceeds 5%',
          approverRole: 'PMO',
          state: 'PENDING',
        },
        {
          position: 3,
          level: 'SPONSOR',
          reason: 'Cost change of 8% of the budget exceeds 15%',
          approverId: USER.pmo,
          state: 'WAITING',
        },
      ],
      submittedAt: at(-3),
      createdAt: at(-8),
      version: 3,
    },
    {
      id: CHANGE_REQUEST(3),
      projectId: PROJECT.mobile,
      number: 3,
      revision: 1,
      title: 'Extend the staff beta by two weeks',
      reason: 'The security audit starts later than planned.',
      type: 'SCHEDULE',
      status: 'SUBMITTED',
      impact: { scheduleDeltaDays: 10, changesCharterScope: false },
      requestedById: USER.member,
      steps: [pmStep('PENDING')],
      submittedAt: at(-1),
      createdAt: at(-1),
      version: 2,
    },
    {
      id: CHANGE_REQUEST(4),
      projectId: PROJECT.mobile,
      number: 4,
      revision: 1,
      title: 'Leave the dark theme out of the first release',
      reason: 'It saves design and test time; few customers asked for it.',
      type: 'SCOPE',
      status: 'DRAFT',
      impact: { costDelta: rwf('-1500000'), scheduleDeltaDays: -2, changesCharterScope: false },
      requestedById: USER.pm,
      steps: [],
      createdAt: at(-1),
      version: 1,
    },
    {
      id: CHANGE_REQUEST(5),
      projectId: PROJECT.mobile,
      number: 5,
      revision: 1,
      title: 'Rebuild the app with a cross-platform framework',
      reason: 'One code base for Android and iOS.',
      type: 'OTHER',
      status: 'REJECTED',
      impact: { costDelta: rwf('30000000'), scheduleDeltaDays: 40, changesCharterScope: false },
      requestedById: USER.member,
      steps: [
        pmStep('REJECTED', {
          decidedById: USER.pm,
          comment: 'Too late in this project; consider it for version 2.',
          decidedAt: at(-30),
        }),
        {
          position: 2,
          level: 'PMO',
          reason: 'Cost change of 20% of the budget exceeds 5%',
          approverRole: 'PMO',
          state: 'SKIPPED',
        },
        {
          position: 3,
          level: 'SPONSOR',
          reason: 'Cost change of 20% of the budget exceeds 15%',
          approverId: USER.pmo,
          state: 'SKIPPED',
        },
      ],
      submittedAt: at(-32),
      decidedAt: at(-30),
      createdAt: at(-33),
      version: 3,
    },
  ];
  // The sponsor step of CR 2 is there because it changes the charter's scope, not its cost.
  changeRequests[1].steps[2].reason = 'It changes the scope in the charter the sponsor approved';

  return {
    risks,
    riskAssessments,
    issues,
    stakeholders,
    changeRequests,
    changeControls: [],
  };
}
