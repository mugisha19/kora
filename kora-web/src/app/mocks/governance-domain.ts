import {
  ApprovalStep,
  ChangeControlSettings,
  ChangeRequest,
  ENGAGEMENTS,
  Issue,
  Risk,
  RiskAssessment,
  Role,
  Severity,
  Stakeholder,
  StakeholderQuadrant,
} from '../core/api/api.models';
import { MembershipRecord } from './data';
import {
  ApprovalStepRecord,
  ChangeControlRecord,
  ChangeRequestRecord,
  IssueRecord,
  RiskAssessmentRecord,
  RiskRecord,
  StakeholderRecord,
} from './data-governance';
import { ProjectRecord } from './data-projects';
import { db } from './db';
import { currencyDigits, fromUnits, percentOf, toUnits } from './decimal';
import { currentCharter, orgToday, userRef } from './projects-domain';
import { CycleError } from './cpm';
import { saveBaseline, workingDaysOf } from './schedule-domain';
import { manages } from './work-domain';

/**
 * Features 11–14 as the API implements them (contract 0.5.0): risk scoring and bands, issue
 * overdue/escalation flags, the power/interest grid, the change-request approval chain (Chain of
 * Responsibility on the API side) and what the last approval changes.
 */

const DAY = 86_400_000;

function projectCode(projectId: string): string {
  return db.state.projects.find((p) => p.id === projectId)?.code ?? '?';
}

/** Owners and approvers must be members of the organization (400 otherwise). */
export function orgMember(organizationId: string, userId: string): boolean {
  return db.state.memberships.some(
    (m) => m.organizationId === organizationId && m.userId === userId,
  );
}

// ---------- Risks ----------

/** 1–4 LOW, 5–9 MEDIUM, 10–14 HIGH, 15–25 CRITICAL. */
export function severityOf(score: number): Severity {
  if (score >= 15) return 'CRITICAL';
  if (score >= 10) return 'HIGH';
  if (score >= 5) return 'MEDIUM';
  return 'LOW';
}

export function riskKey(record: RiskRecord): string {
  return `${projectCode(record.projectId)}-R${record.number}`;
}

export function isOpenRisk(record: RiskRecord): boolean {
  return record.status !== 'CLOSED';
}

export function reviewOverdue(record: RiskRecord, today: string): boolean {
  return isOpenRisk(record) && !!record.reviewDate && record.reviewDate < today;
}

export function toRisk(record: RiskRecord): Risk {
  const project = db.state.projects.find((p) => p.id === record.projectId);
  const today = orgToday(project?.organizationId ?? '');
  const score = record.probability * record.impact;
  const residual =
    record.residualProbability && record.residualImpact
      ? record.residualProbability * record.residualImpact
      : undefined;
  return {
    id: record.id,
    key: riskKey(record),
    projectId: record.projectId,
    title: record.title,
    ...(record.description ? { description: record.description } : {}),
    category: record.category,
    ...(record.proximity ? { proximity: record.proximity } : {}),
    ...(record.ownerId ? { ownerId: record.ownerId, owner: userRef(record.ownerId) } : {}),
    ...(record.responseStrategy ? { responseStrategy: record.responseStrategy } : {}),
    ...(record.responsePlan ? { responsePlan: record.responsePlan } : {}),
    ...(record.triggerConditions ? { triggerConditions: record.triggerConditions } : {}),
    ...(record.reviewDate ? { reviewDate: record.reviewDate } : {}),
    kind: record.kind,
    status: record.status,
    probability: record.probability,
    impact: record.impact,
    score,
    severity: severityOf(score),
    ...(record.residualProbability ? { residualProbability: record.residualProbability } : {}),
    ...(record.residualImpact ? { residualImpact: record.residualImpact } : {}),
    ...(residual !== undefined ? { residualScore: residual } : {}),
    identifiedBy: userRef(record.identifiedById),
    reviewOverdue: reviewOverdue(record, today),
    ...(record.closure ? { closure: record.closure } : {}),
    ...(record.closureNote ? { closureNote: record.closureNote } : {}),
    ...(record.issueId ? { issueId: record.issueId } : {}),
    createdAt: record.createdAt,
    version: record.version,
  };
}

export function toAssessment(record: RiskAssessmentRecord): RiskAssessment {
  return {
    id: record.id,
    probability: record.probability,
    impact: record.impact,
    score: record.probability * record.impact,
    ...(record.residualProbability ? { residualProbability: record.residualProbability } : {}),
    ...(record.residualImpact ? { residualImpact: record.residualImpact } : {}),
    ...(record.note ? { note: record.note } : {}),
    assessedBy: userRef(record.assessedById),
    assessedAt: record.assessedAt,
  };
}

/** The project's managers or the risk's owner edit, assess, close and materialize it. */
export function canManageRisk(
  record: RiskRecord,
  project: ProjectRecord,
  membership: MembershipRecord,
): boolean {
  return manages(project, membership) || record.ownerId === membership.userId;
}

// ---------- Issues ----------

export function issueKey(record: IssueRecord): string {
  return `${projectCode(record.projectId)}-I${record.number}`;
}

export function isUnresolved(record: IssueRecord): boolean {
  return record.status === 'OPEN' || record.status === 'IN_PROGRESS';
}

export function toIssue(record: IssueRecord, now = Date.now()): Issue {
  const project = db.state.projects.find((p) => p.id === record.projectId);
  const today = orgToday(project?.organizationId ?? '', now);
  return {
    id: record.id,
    key: issueKey(record),
    projectId: record.projectId,
    title: record.title,
    ...(record.description ? { description: record.description } : {}),
    type: record.type,
    priority: record.priority,
    status: record.status,
    ...(record.ownerId ? { owner: userRef(record.ownerId) } : {}),
    raisedBy: userRef(record.raisedById),
    ...(record.dueDate ? { dueDate: record.dueDate } : {}),
    ...(record.resolution ? { resolution: record.resolution } : {}),
    ...(record.resolvedAt ? { resolvedAt: record.resolvedAt } : {}),
    ...(record.riskId ? { riskId: record.riskId } : {}),
    ...(record.changeRequestId ? { changeRequestId: record.changeRequestId } : {}),
    overdue: isUnresolved(record) && !!record.dueDate && record.dueDate < today,
    escalated:
      isUnresolved(record) &&
      record.priority === 'CRITICAL' &&
      Date.parse(record.createdAt) < now - 3 * DAY,
    createdAt: record.createdAt,
    version: record.version,
  };
}

export function canManageIssue(
  record: IssueRecord,
  project: ProjectRecord,
  membership: MembershipRecord,
): boolean {
  return manages(project, membership) || record.ownerId === membership.userId;
}

// ---------- Stakeholders ----------

/** "High" is 3 or more on the 1–5 scale. */
export function quadrantOf(power: number, interest: number): StakeholderQuadrant {
  const highPower = power >= 3;
  const highInterest = interest >= 3;
  if (highPower) return highInterest ? 'MANAGE_CLOSELY' : 'KEEP_SATISFIED';
  return highInterest ? 'KEEP_INFORMED' : 'MONITOR';
}

export function engagementGap(record: StakeholderRecord): number {
  return (
    ENGAGEMENTS.indexOf(record.desiredEngagement) - ENGAGEMENTS.indexOf(record.currentEngagement)
  );
}

export function toStakeholder(record: StakeholderRecord): Stakeholder {
  return {
    id: record.id,
    projectId: record.projectId,
    name: record.name,
    ...(record.organization ? { organization: record.organization } : {}),
    ...(record.role ? { role: record.role } : {}),
    ...(record.email ? { email: record.email } : {}),
    ...(record.phone ? { phone: record.phone } : {}),
    ...(record.userId ? { userId: record.userId } : {}),
    power: record.power,
    interest: record.interest,
    ...(record.influence ? { influence: record.influence } : {}),
    currentEngagement: record.currentEngagement,
    desiredEngagement: record.desiredEngagement,
    engagementGap: engagementGap(record),
    quadrant: quadrantOf(record.power, record.interest),
    ...(record.communicationPreferences
      ? { communicationPreferences: record.communicationPreferences }
      : {}),
    ...(record.notes ? { notes: record.notes } : {}),
    removed: record.removed,
    version: record.version,
  };
}

/** Erases the personal data and keeps the record, so nothing that refers to it breaks. */
export function anonymize(record: StakeholderRecord): void {
  record.name = 'Removed stakeholder';
  delete record.organization;
  delete record.role;
  delete record.email;
  delete record.phone;
  delete record.userId;
  delete record.communicationPreferences;
  delete record.notes;
  record.removed = true;
  record.version += 1;
}

// ---------- Change requests ----------

export const DEFAULT_CHANGE_CONTROL = {
  pmoCostPercent: 5,
  pmoScheduleDays: 10,
  sponsorCostPercent: 15,
};

export function changeControlOf(organizationId: string): ChangeControlRecord {
  return (
    db.state.changeControls.find((c) => c.organizationId === organizationId) ?? {
      organizationId,
      ...DEFAULT_CHANGE_CONTROL,
      version: 0,
    }
  );
}

export function toChangeControl(record: ChangeControlRecord): ChangeControlSettings {
  return {
    pmoCostPercent: record.pmoCostPercent,
    pmoScheduleDays: record.pmoScheduleDays,
    sponsorCostPercent: record.sponsorCostPercent,
    version: record.version,
  };
}

export function changeRequestKey(record: ChangeRequestRecord): string {
  return `${projectCode(record.projectId)}-CR${record.number}`;
}

function toStep(record: ApprovalStepRecord): ApprovalStep {
  return {
    position: record.position,
    level: record.level,
    reason: record.reason,
    ...(record.approverId ? { approver: userRef(record.approverId) } : {}),
    ...(record.approverRole ? { approverRole: record.approverRole } : {}),
    state: record.state,
    ...(record.decidedById ? { decidedBy: userRef(record.decidedById) } : {}),
    ...(record.comment ? { comment: record.comment } : {}),
    ...(record.decidedAt ? { decidedAt: record.decidedAt } : {}),
  };
}

export function toChangeRequest(record: ChangeRequestRecord): ChangeRequest {
  return {
    id: record.id,
    key: changeRequestKey(record),
    revision: record.revision,
    projectId: record.projectId,
    title: record.title,
    ...(record.description ? { description: record.description } : {}),
    reason: record.reason,
    type: record.type,
    status: record.status,
    impact: record.impact,
    requestedBy: userRef(record.requestedById),
    ...(record.issueId ? { issueId: record.issueId } : {}),
    ...(record.previousRevisionId ? { previousRevisionId: record.previousRevisionId } : {}),
    steps: record.steps.map(toStep),
    ...(record.submittedAt ? { submittedAt: record.submittedAt } : {}),
    ...(record.decidedAt ? { decidedAt: record.decidedAt } : {}),
    createdAt: record.createdAt,
    version: record.version,
  };
}

/** The requester or the project's managers edit, submit, withdraw and revise. */
export function canEditChangeRequest(
  record: ChangeRequestRecord,
  project: ProjectRecord,
  membership: MembershipRecord,
): boolean {
  return record.requestedById === membership.userId || manages(project, membership);
}

export function inReview(record: ChangeRequestRecord): boolean {
  return record.status === 'SUBMITTED' || record.status === 'IN_REVIEW';
}

export function pendingStep(record: ChangeRequestRecord): ApprovalStepRecord | undefined {
  return record.steps.find((s) => s.state === 'PENDING');
}

/** A named approver decides alone; a role step is any holder but the requester (ORG_ADMIN may take PMO steps). */
export function mayDecide(
  step: ApprovalStepRecord,
  userId: string,
  role: Role,
  requesterId: string,
) {
  if (step.approverId) return step.approverId === userId;
  if (userId === requesterId) return false;
  return role === step.approverRole || (step.approverRole === 'PMO' && role === 'ORG_ADMIN');
}

export function awaits(record: ChangeRequestRecord, membership: MembershipRecord): boolean {
  const step = pendingStep(record);
  return (
    inReview(record) &&
    record.requestedById !== membership.userId &&
    !!step &&
    mayDecide(step, membership.userId, membership.role, record.requestedById)
  );
}

const stripZeros = (value: string) => value.replace(/\.?0+$/, '');

/**
 * The approval chain, as the API's handlers build it at submission: the project manager always
 * (the PMO when the manager asked), the PMO over its cost or schedule threshold, the sponsor over
 * theirs or when the charter's scope changes (an administrator when there is no sponsor or the
 * sponsor asked).
 */
export function chainFor(
  record: ChangeRequestRecord,
  project: ProjectRecord,
): ApprovalStepRecord[] {
  const limits = changeControlOf(project.organizationId);
  const sponsorId = currentCharter(project.id)?.sponsorId;
  const cost = record.impact.costDelta;
  const days = Math.abs(record.impact.scheduleDeltaDays ?? 0);
  const budget = project.budget;
  const hasCost = !!cost && toUnits(cost.amount) !== 0n;
  const noBudget = !budget || toUnits(budget.amount) === 0n;
  /** |cost| as a percentage of the budget, 2 decimals, as a string. */
  const percent = (): string => {
    if (!cost || !budget) return '0';
    const units = toUnits(cost.amount);
    const share = ((units < 0n ? -units : units) * 1_000_000n) / toUnits(budget.amount);
    return stripZeros(fromUnits(share, 2));
  };
  const costAbove = (limit: number) =>
    hasCost &&
    (noBudget ||
      (toUnits(cost.amount) < 0n ? -toUnits(cost.amount) : toUnits(cost.amount)) >
        percentOf(budget.amount, limit));
  const costReason = (limit: number) =>
    noBudget
      ? 'Cost change without a project budget to compare it with'
      : `Cost change of ${percent()}% of the budget exceeds ${limit}%`;

  const steps: Omit<ApprovalStepRecord, 'position' | 'state'>[] = [
    project.managerId === record.requestedById
      ? {
          level: 'PROJECT_MANAGER',
          reason: 'The project manager requested it, so the PMO confirms the analysis instead',
          approverRole: 'PMO',
        }
      : {
          level: 'PROJECT_MANAGER',
          reason: 'The project manager confirms the impact analysis',
          approverId: project.managerId,
        },
  ];
  if (costAbove(limits.pmoCostPercent)) {
    steps.push({ level: 'PMO', reason: costReason(limits.pmoCostPercent), approverRole: 'PMO' });
  } else if (days > limits.pmoScheduleDays) {
    steps.push({
      level: 'PMO',
      reason: `Schedule change of ${days} working days exceeds ${limits.pmoScheduleDays}`,
      approverRole: 'PMO',
    });
  }
  let sponsorReason: string | undefined;
  if (costAbove(limits.sponsorCostPercent)) sponsorReason = costReason(limits.sponsorCostPercent);
  else if (record.impact.changesCharterScope) {
    sponsorReason = 'It changes the scope in the charter the sponsor approved';
  }
  if (sponsorReason) {
    steps.push(
      !sponsorId || sponsorId === record.requestedById
        ? {
            level: 'SPONSOR',
            reason: `${sponsorReason}; ${
              sponsorId
                ? 'the sponsor requested it, so an administrator decides'
                : 'there is no sponsor, so an administrator decides'
            }`,
            approverRole: 'ORG_ADMIN',
          }
        : { level: 'SPONSOR', reason: sponsorReason, approverId: sponsorId },
    );
  }
  return steps.map((step, index) => ({
    ...step,
    position: index + 1,
    state: index === 0 ? 'PENDING' : 'WAITING',
  }));
}

/**
 * The last approval changes every baseline the request touches, together: the budget, the target
 * end date (in working days), the charter (a new approved version with the scope added) and, on
 * scheduled projects, a new schedule baseline.
 */
export function applyApprovedChange(
  record: ChangeRequestRecord,
  project: ProjectRecord,
  approverId: string,
): void {
  const cost = record.impact.costDelta;
  if (cost && toUnits(cost.amount) !== 0n) {
    const digits = currencyDigits(cost.currency);
    const budget = project.budget ?? { amount: '0', currency: cost.currency };
    project.budget = {
      amount: fromUnits(toUnits(budget.amount) + toUnits(cost.amount), digits),
      currency: budget.currency,
    };
  }
  const days = record.impact.scheduleDeltaDays ?? 0;
  if (days !== 0) {
    const calendar = workingDaysOf(project);
    project.targetEndDate = calendar.date(calendar.index(project.targetEndDate) + days);
  }
  project.version += 1;

  const charter = currentCharter(project.id);
  if (record.impact.changesCharterScope && charter) {
    const digits = currencyDigits(cost?.currency ?? 'RWF');
    charter.status = 'SUPERSEDED';
    db.state.charters.push({
      ...charter,
      versionNumber: charter.versionNumber + 1,
      status: 'APPROVED',
      inScope: [
        ...charter.inScope,
        `${record.impact.scopeSummary ?? record.title} (${changeRequestKey(record)})`,
      ],
      ...(charter.summaryBudget && cost
        ? {
            summaryBudget: {
              amount: fromUnits(
                toUnits(charter.summaryBudget.amount) + toUnits(cost.amount),
                digits,
              ),
              currency: charter.summaryBudget.currency,
            },
          }
        : {}),
      approvedById: approverId,
      approvedAt: new Date().toISOString(),
      version: 1,
    });
  }
  if (days !== 0 && project.methodology !== 'AGILE') {
    try {
      saveBaseline(project, approverId);
    } catch (error: unknown) {
      // A loop stops the schedule; the change still applies (the API reports the loop later).
      if (!(error instanceof CycleError)) throw error;
    }
  }
}
