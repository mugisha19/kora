import {
  CharterMilestone,
  CharterObjective,
  CharterStatus,
  Health,
  Methodology,
  Money,
  PortfolioStatus,
  ProgramStatus,
  ProjectStatus,
  WbsNodeType,
} from '../core/api/api.models';
import { ORG_AKAGERA, ORG_VIRUNGA, USER, kigaliDate } from './data';

/**
 * Phase 4 demo data (feature 22's story): Akagera Digital's "Digital Services 2026" portfolio with
 * programs and projects across methodologies, some healthy, one late (amber), one overridden red,
 * a charter awaiting approval, and WBS trees with progress. All fictional.
 */

export interface PortfolioRecord {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  strategicObjectives: string[];
  ownerId: string;
  status: PortfolioStatus;
  createdAt: string;
  version: number;
}

export interface ProgramRecord {
  id: string;
  organizationId: string;
  portfolioId: string;
  name: string;
  description?: string;
  managerId: string;
  status: ProgramStatus;
  createdAt: string;
  version: number;
}

export interface ProjectRecord {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  description?: string;
  portfolioId: string;
  programId?: string;
  managerId: string;
  methodology: Methodology;
  status: ProjectStatus;
  startDate: string;
  targetEndDate: string;
  budget?: Money;
  healthOverride?: { health: Exclude<Health, 'GREY'>; reason: string };
  createdAt: string;
  version: number;
}

export interface ProjectMemberRecord {
  projectId: string;
  userId: string;
  projectRole: 'CONTRIBUTOR' | 'OBSERVER';
  addedAt: string;
}

export interface CharterRecord {
  projectId: string;
  versionNumber: number;
  status: CharterStatus;
  purpose?: string;
  businessCase?: string;
  objectives: CharterObjective[];
  inScope: string[];
  outOfScope: string[];
  assumptions: string[];
  constraints: string[];
  highLevelRisks: string[];
  milestones: CharterMilestone[];
  summaryBudget?: Money;
  sponsorId?: string;
  submittedAt?: string;
  approvedById?: string;
  approvedAt?: string;
  returnComment?: string;
  version: number;
}

export interface WbsNodeRecord {
  id: string;
  projectId: string;
  parentId?: string;
  name: string;
  description?: string;
  type: WbsNodeType;
  ownerId?: string;
  /** Work packages only; deliverables roll up from their children. */
  plannedEffortHours: number;
  plannedCost: string;
  percentComplete: number;
  position: number;
  version: number;
}

export interface ProjectSeed {
  portfolios: PortfolioRecord[];
  programs: ProgramRecord[];
  projects: ProjectRecord[];
  projectMembers: ProjectMemberRecord[];
  charters: CharterRecord[];
  wbsNodes: WbsNodeRecord[];
}

const DAY = 86_400_000;
const person = (n: number) => `6f1e2d3c-4b5a-4c6d-8e7f-${n.toString().padStart(12, '0')}`;
const id = (prefix: string, n: number) =>
  `${prefix}-0000-4000-8000-${n.toString().padStart(12, '0')}`;

export const PEOPLE = {
  alice: person(100), // Alice Umutoni, PROJECT_MANAGER
  herve: person(107), // Herve Munyaneza, PROJECT_MANAGER
  odette: person(114), // Odette Mukamurenzi, PROJECT_MANAGER
  olivier: person(900), // Olivier Hakizimana, ORG_ADMIN of Virunga
} as const;

export const PORTFOLIO = {
  digital: id('7a1b2c3d', 1),
  operations: id('7a1b2c3d', 2),
  construction: id('7a1b2c3d', 3),
} as const;

export const PROGRAM = {
  channels: id('7b1b2c3d', 1),
  platforms: id('7b1b2c3d', 2),
} as const;

export const PROJECT = {
  mobile: id('7c1b2c3d', 1),
  portal: id('7c1b2c3d', 2),
  erp: id('7c1b2c3d', 3),
  fitOut: id('7c1b2c3d', 4),
  warehouse: id('7c1b2c3d', 5),
  training: id('7c1b2c3d', 6),
  crm: id('7c1b2c3d', 7),
  clinic: id('7c1b2c3d', 8),
  depot: id('7c1b2c3d', 9),
} as const;

const rwf = (amount: string): Money => ({ amount, currency: 'RWF' });

export function createProjectSeed(now = Date.now()): ProjectSeed {
  const at = (days: number) => new Date(now + days * DAY).toISOString();
  const date = (days: number) => kigaliDate(now + days * DAY);

  const portfolios: PortfolioRecord[] = [
    {
      id: PORTFOLIO.digital,
      organizationId: ORG_AKAGERA,
      name: 'Digital Services 2026',
      description: 'Bring our core banking and customer services online.',
      strategicObjectives: [
        'Half of customer transactions happen on digital channels by the end of 2026',
        'Retire systems that cost more to run than they return',
      ],
      ownerId: USER.pmo,
      status: 'ACTIVE',
      createdAt: at(-200),
      version: 1,
    },
    {
      id: PORTFOLIO.operations,
      organizationId: ORG_AKAGERA,
      name: 'Operations Excellence',
      description: 'Workplace and people initiatives.',
      strategicObjectives: ['A workplace that supports hybrid teams'],
      ownerId: USER.admin,
      status: 'ACTIVE',
      createdAt: at(-150),
      version: 1,
    },
    {
      id: PORTFOLIO.construction,
      organizationId: ORG_VIRUNGA,
      name: 'Construction 2026',
      strategicObjectives: ['Deliver public facilities on time and on budget'],
      ownerId: PEOPLE.olivier,
      status: 'ACTIVE',
      createdAt: at(-120),
      version: 1,
    },
  ];

  const programs: ProgramRecord[] = [
    {
      id: PROGRAM.channels,
      organizationId: ORG_AKAGERA,
      portfolioId: PORTFOLIO.digital,
      name: 'Customer Channels',
      description: 'Everything a customer touches.',
      managerId: USER.pm,
      status: 'ACTIVE',
      createdAt: at(-190),
      version: 1,
    },
    {
      id: PROGRAM.platforms,
      organizationId: ORG_AKAGERA,
      portfolioId: PORTFOLIO.digital,
      name: 'Core Platforms',
      managerId: PEOPLE.alice,
      status: 'ACTIVE',
      createdAt: at(-185),
      version: 1,
    },
  ];

  const project = (
    key: keyof typeof PROJECT,
    fields: Omit<ProjectRecord, 'id' | 'createdAt' | 'version'>,
  ): ProjectRecord => ({ id: PROJECT[key], createdAt: at(-180), version: 1, ...fields });

  const projects: ProjectRecord[] = [
    project('mobile', {
      organizationId: ORG_AKAGERA,
      code: 'AKG-001',
      name: 'Mobile banking app',
      description: 'A mobile app for balances, transfers and bill payments.',
      portfolioId: PORTFOLIO.digital,
      programId: PROGRAM.channels,
      managerId: USER.pm,
      methodology: 'AGILE',
      status: 'IN_PROGRESS',
      startDate: date(-120),
      targetEndDate: date(90),
      budget: rwf('150000000'),
    }),
    project('portal', {
      organizationId: ORG_AKAGERA,
      code: 'AKG-002',
      name: 'Customer self-service portal',
      portfolioId: PORTFOLIO.digital,
      programId: PROGRAM.channels,
      managerId: USER.pm,
      methodology: 'HYBRID',
      status: 'IN_PROGRESS',
      startDate: date(-200),
      // Past its target end date while still in progress: AMBER by the health rule.
      targetEndDate: date(-10),
      budget: rwf('80000000'),
    }),
    project('erp', {
      organizationId: ORG_AKAGERA,
      code: 'AKG-003',
      name: 'ERP rollout',
      portfolioId: PORTFOLIO.digital,
      programId: PROGRAM.platforms,
      managerId: PEOPLE.alice,
      methodology: 'HYBRID',
      status: 'IN_PROGRESS',
      startDate: date(-160),
      targetEndDate: date(120),
      budget: rwf('320000000'),
      healthOverride: { health: 'RED', reason: 'Finance module vendor is three months late' },
    }),
    project('fitOut', {
      organizationId: ORG_AKAGERA,
      code: 'AKG-004',
      name: 'Kigali office fit-out',
      portfolioId: PORTFOLIO.operations,
      managerId: PEOPLE.herve,
      methodology: 'PREDICTIVE',
      status: 'APPROVED',
      startDate: date(14),
      targetEndDate: date(150),
      budget: rwf('95000000'),
    }),
    project('warehouse', {
      organizationId: ORG_AKAGERA,
      code: 'AKG-005',
      name: 'Data warehouse',
      portfolioId: PORTFOLIO.digital,
      programId: PROGRAM.platforms,
      managerId: USER.pm,
      methodology: 'PREDICTIVE',
      status: 'PROPOSED',
      startDate: date(30),
      targetEndDate: date(240),
      budget: rwf('60000000'),
    }),
    project('training', {
      organizationId: ORG_AKAGERA,
      code: 'AKG-006',
      name: 'Staff digital skills programme',
      portfolioId: PORTFOLIO.operations,
      managerId: PEOPLE.odette,
      methodology: 'AGILE',
      status: 'ON_HOLD',
      startDate: date(-60),
      targetEndDate: date(60),
    }),
    project('crm', {
      organizationId: ORG_AKAGERA,
      code: 'AKG-007',
      name: 'Legacy CRM retirement',
      portfolioId: PORTFOLIO.digital,
      programId: PROGRAM.platforms,
      managerId: PEOPLE.alice,
      methodology: 'PREDICTIVE',
      status: 'CLOSED',
      startDate: date(-300),
      targetEndDate: date(-40),
      budget: rwf('25000000'),
    }),
    project('clinic', {
      organizationId: ORG_VIRUNGA,
      code: 'VBP-001',
      name: 'Musanze clinic build',
      portfolioId: PORTFOLIO.construction,
      managerId: PEOPLE.olivier,
      methodology: 'PREDICTIVE',
      status: 'IN_PROGRESS',
      startDate: date(-90),
      targetEndDate: date(200),
      budget: rwf('450000000'),
    }),
    project('depot', {
      organizationId: ORG_VIRUNGA,
      code: 'VBP-002',
      name: 'Equipment depot',
      portfolioId: PORTFOLIO.construction,
      managerId: PEOPLE.olivier,
      methodology: 'AGILE',
      status: 'PROPOSED',
      startDate: date(45),
      targetEndDate: date(180),
    }),
  ];

  const member = (
    key: keyof typeof PROJECT,
    userId: string,
    projectRole: ProjectMemberRecord['projectRole'],
  ): ProjectMemberRecord => ({ projectId: PROJECT[key], userId, projectRole, addedAt: at(-100) });

  const projectMembers: ProjectMemberRecord[] = [
    member('mobile', USER.member, 'CONTRIBUTOR'),
    member('mobile', USER.viewer, 'OBSERVER'),
    member('mobile', USER.pmo, 'OBSERVER'),
    member('mobile', PEOPLE.odette, 'CONTRIBUTOR'),
    member('portal', USER.member, 'CONTRIBUTOR'),
    member('erp', USER.pm, 'CONTRIBUTOR'),
    member('warehouse', USER.pmo, 'OBSERVER'),
  ];

  const approved = (key: keyof typeof PROJECT, content: Partial<CharterRecord>): CharterRecord => ({
    projectId: PROJECT[key],
    versionNumber: 1,
    status: 'APPROVED',
    objectives: [],
    inScope: [],
    outOfScope: [],
    assumptions: [],
    constraints: [],
    highLevelRisks: [],
    milestones: [],
    sponsorId: USER.pmo,
    submittedAt: at(-175),
    approvedById: USER.pmo,
    approvedAt: at(-170),
    version: 3,
    ...content,
  });

  const draft = (key: keyof typeof PROJECT): CharterRecord => ({
    projectId: PROJECT[key],
    versionNumber: 1,
    status: 'DRAFT',
    objectives: [],
    inScope: [],
    outOfScope: [],
    assumptions: [],
    constraints: [],
    highLevelRisks: [],
    milestones: [],
    version: 1,
  });

  const charters: CharterRecord[] = [
    approved('mobile', {
      purpose: 'Let customers bank from their phones, any time.',
      businessCase:
        'Branch visits cost ten times more than digital transactions; mobile adoption in Rwanda keeps rising.',
      objectives: [
        {
          text: 'Launch balances and transfers to all retail customers',
          successMetric: 'Live in app stores by the target date',
        },
        {
          text: 'Move routine transactions to mobile',
          successMetric: '30% of transfers on mobile within 6 months of launch',
        },
      ],
      inScope: ['Balances and statements', 'Transfers between own accounts', 'Bill payments'],
      outOfScope: ['Loans', 'Business accounts'],
      assumptions: ['The core banking API is stable'],
      constraints: ['Central bank security guidelines'],
      highLevelRisks: ['App store review delays'],
      milestones: [
        { name: 'Beta with staff', targetDate: date(20) },
        { name: 'Public launch', targetDate: date(85) },
      ],
      summaryBudget: rwf('150000000'),
    }),
    approved('portal', {
      purpose: 'Self-service for the most common customer requests.',
      objectives: [{ text: 'Cut call-centre volume', successMetric: '20% fewer calls' }],
      milestones: [{ name: 'Go-live', targetDate: date(-10) }],
    }),
    approved('erp', {
      purpose: 'One system for finance, procurement and HR.',
      objectives: [
        { text: 'Close the books in five days', successMetric: 'Month-end close ≤ 5 working days' },
      ],
      milestones: [
        { name: 'Finance module live', targetDate: date(45) },
        { name: 'HR module live', targetDate: date(110) },
      ],
      sponsorId: USER.admin,
      approvedById: USER.admin,
    }),
    approved('fitOut', {
      purpose: 'A headquarters that supports hybrid work.',
      objectives: [
        {
          text: 'Move all Kigali staff to one site',
          successMetric: 'Old office lease ends on time',
        },
      ],
      milestones: [{ name: 'Contractor on site', targetDate: date(20) }],
      sponsorId: USER.admin,
      approvedById: USER.admin,
    }),
    {
      ...draft('warehouse'),
      status: 'SUBMITTED',
      purpose: 'One place for reporting data.',
      businessCase: 'Reports today are assembled by hand from five systems.',
      objectives: [
        { text: 'Daily management dashboards', successMetric: 'Reports ready by 8 am daily' },
      ],
      inScope: ['Finance and customer data'],
      milestones: [{ name: 'First data mart', targetDate: date(120) }],
      summaryBudget: rwf('60000000'),
      sponsorId: USER.pmo,
      submittedAt: at(-2),
      version: 4,
    },
    approved('training', { purpose: 'Digital skills for every employee.' }),
    approved('crm', { purpose: 'Switch off the old CRM.' }),
    approved('clinic', {
      purpose: 'A clinic for Musanze district.',
      sponsorId: PEOPLE.olivier,
      approvedById: PEOPLE.olivier,
    }),
    draft('depot'),
  ];

  let nodeNo = 1;
  const wbsNodes: WbsNodeRecord[] = [];
  /** Builds a tree: `[name, children]` for deliverables, `[name, effort, cost, percent]` for work packages. */
  type Spec = [string, Spec[]] | [string, number, string, number];
  const addTree = (projectKey: keyof typeof PROJECT, specs: Spec[], parentId?: string) => {
    specs.forEach((spec, position) => {
      const nodeId = id('7d1b2c3d', nodeNo++);
      if (Array.isArray(spec[1])) {
        wbsNodes.push({
          id: nodeId,
          projectId: PROJECT[projectKey],
          parentId,
          name: spec[0],
          type: 'DELIVERABLE',
          plannedEffortHours: 0,
          plannedCost: '0',
          percentComplete: 0,
          position,
          version: 1,
        });
        addTree(projectKey, spec[1], nodeId);
      } else {
        const [name, effort, cost, percent] = spec as [string, number, string, number];
        wbsNodes.push({
          id: nodeId,
          projectId: PROJECT[projectKey],
          parentId,
          name,
          type: 'WORK_PACKAGE',
          plannedEffortHours: effort,
          plannedCost: cost,
          percentComplete: percent,
          position,
          version: 1,
        });
      }
    });
  };

  addTree('mobile', [
    [
      'Discovery',
      [
        ['User research', 120, '3600000', 100],
        ['Architecture', 80, '2400000', 100],
      ],
    ],
    [
      'Release 1',
      [
        ['Accounts and balances', 400, '12000000', 80],
        ['Payments', 600, '18000000', 45],
        ['Security hardening', 200, '6000000', 20],
      ],
    ],
    [
      'Launch',
      [
        ['App store submission', 40, '1200000', 0],
        ['Marketing campaign', 80, '2400000', 0],
      ],
    ],
  ]);
  addTree('portal', [
    [
      'Portal MVP',
      [
        ['Account requests', 300, '9000000', 90],
        ['Document upload', 250, '7500000', 60],
      ],
    ],
    ['Contact centre integration', 200, '6000000', 30],
  ]);
  addTree('erp', [
    [
      'Finance module',
      [
        ['Chart of accounts', 160, '8000000', 100],
        ['Payables and receivables', 480, '24000000', 40],
      ],
    ],
    ['HR module', [['Payroll', 400, '20000000', 10]]],
  ]);
  addTree('fitOut', [
    ['Design', [['Space plan', 60, '3000000', 0]]],
    [
      'Construction',
      [
        ['Partitions and electrics', 300, '45000000', 0],
        ['Furniture', 80, '20000000', 0],
      ],
    ],
  ]);
  addTree('clinic', [
    ['Foundations', 900, '90000000', 100],
    ['Structure', 1500, '180000000', 35],
  ]);

  return { portfolios, programs, projects, projectMembers, charters, wbsNodes };
}
