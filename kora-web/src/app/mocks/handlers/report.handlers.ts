import { http, HttpResponse } from 'msw';
import {
  REPORTS_MAX_PENDING,
  REPORT_FORMATS,
  REPORT_TYPES,
  ReportFormat,
  ReportJob,
  ReportParams,
  ReportType,
} from '../../core/api/api.models';
import { ReportJobRecord } from '../data-activity';
import { db } from '../db';
import { bacOf } from '../evm-domain';
import { API, Validator, invalidBody, latency, readBody, reply } from '../http';
import { notify } from '../outbox';
import { canSee } from '../projects-domain';
import { manages } from '../work-domain';
import { placeholderPdf } from './attachment.handlers';
import { caller } from './portfolio.handlers';

const DAY = 86_400_000;
/** A READY job's link lasts five minutes; the file is kept seven days. */
const LINK_MINUTES = 5;
const KEEP_DAYS = 7;
/** At most this many of my jobs are listed. */
const LISTED = 50;

/** How long a job takes in the mock; unit tests shorten it. */
let duration = 2_500;
export function setReportDuration(ms: number): void {
  duration = ms;
}

const NEEDS_PROJECT: readonly ReportType[] = ['PROJECT_STATUS', 'EVM', 'TIMESHEETS'];
const SLUG: Record<ReportType, string> = {
  PROJECT_STATUS: 'project-status',
  PORTFOLIO_SUMMARY: 'portfolio-summary',
  RISK_REGISTER: 'risk-register',
  EVM: 'earned-value',
  TIMESHEETS: 'timesheets',
};

function toJob(record: ReportJobRecord, origin: string): ReportJob {
  const ready = record.status === 'READY';
  const rest: Partial<ReportJobRecord> = { ...record };
  delete rest.organizationId;
  delete rest.userId;
  return {
    ...(rest as Omit<ReportJobRecord, 'organizationId' | 'userId'>),
    ...(ready
      ? {
          downloadUrl: `${origin}/mock-storage/reports/${record.id}`,
          downloadExpiresAt: new Date(Date.now() + LINK_MINUTES * 60_000).toISOString(),
        }
      : {}),
  };
}

/** The job runs in the background: RUNNING, then READY (or FAILED), then a notification. */
function run(jobId: string): void {
  setTimeout(() => {
    const job = db.state.reportJobs.find((j) => j.id === jobId);
    if (!job || job.status !== 'QUEUED') return;
    job.status = 'RUNNING';
    db.save();
  }, duration / 3);
  setTimeout(() => {
    const job = db.state.reportJobs.find((j) => j.id === jobId);
    if (!job || job.status === 'READY' || job.status === 'FAILED') return;
    const project = job.params.projectId
      ? db.state.projects.find((p) => p.id === job.params.projectId)
      : undefined;
    const now = new Date();
    job.completedAt = now.toISOString();
    const common = { reportId: job.id, type: job.type, format: job.format };
    if (job.type === 'EVM' && project && bacOf(project) === 0n) {
      job.status = 'FAILED';
      job.failureReason = 'The WBS has no planned cost';
      notify(job.userId, job.organizationId, 'REPORT_FAILED', common, '/reports');
    } else {
      job.status = 'READY';
      const scope = project?.code ?? 'all';
      job.fileName = `${SLUG[job.type]}-${scope}-${now.toISOString().slice(0, 10)}.${job.format === 'PDF' ? 'pdf' : 'xlsx'}`;
      job.sizeBytes = job.format === 'PDF' ? 48_213 : 21_904;
      job.expiresAt = new Date(now.getTime() + KEEP_DAYS * DAY).toISOString();
      notify(
        job.userId,
        job.organizationId,
        'REPORT_READY',
        { ...common, fileName: job.fileName },
        '/reports',
      );
    }
    db.save();
  }, duration);
}

/** Feature 21: report jobs and their files. */
export const reportHandlers = [
  http.get(`${API}/reports`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const origin = new URL(request.url).origin;
    return r.json(
      db.state.reportJobs
        .filter(
          (j) => j.userId === membership.userId && j.organizationId === membership.organizationId,
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, LISTED)
        .map((j) => toJob(j, origin)),
    );
  }),

  http.get(`${API}/reports/:reportId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const job = db.state.reportJobs.find(
      (j) =>
        j.id === params['reportId'] &&
        j.userId === membership.userId &&
        j.organizationId === membership.organizationId,
    );
    if (!job) return r.problem(404, 'resource.not_found');
    return r.json(toJob(job, new URL(request.url).origin));
  }),

  http.post(`${API}/reports`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    const type = body['type'] as ReportType;
    const format = body['format'] as ReportFormat;
    if (!REPORT_TYPES.includes(type)) v.add('type', 'invalid', 'is not a report type');
    if (!REPORT_FORMATS.includes(format)) v.add('format', 'invalid', 'is not a format');
    const params = (body['params'] ?? {}) as ReportParams;
    v.uuid('params.projectId', params.projectId);
    v.uuid('params.portfolioId', params.portfolioId);
    v.date('params.from', params.from);
    v.date('params.to', params.to);
    if (NEEDS_PROJECT.includes(type) && !params.projectId) {
      v.add('params.projectId', 'required', 'is required for this report');
    }
    if (!v.ok) return v.problem(r);

    // Access is checked now, not as a failed job later.
    if (params.projectId) {
      const project = db.state.projects.find((p) => p.id === params.projectId);
      if (!project || !canSee(project, membership)) return r.problem(404, 'resource.not_found');
      if (type === 'TIMESHEETS' && !manages(project, membership)) {
        return r.problem(403, 'access.denied');
      }
    }
    if (params.portfolioId) {
      const portfolio = db.state.portfolios.find(
        (p) => p.id === params.portfolioId && p.organizationId === membership.organizationId,
      );
      if (!portfolio) return r.problem(404, 'resource.not_found');
    }
    const waiting = db.state.reportJobs.filter(
      (j) => j.userId === membership.userId && (j.status === 'QUEUED' || j.status === 'RUNNING'),
    ).length;
    if (waiting >= REPORTS_MAX_PENDING) return r.problem(409, 'reports.too_many_pending');

    const record: ReportJobRecord = {
      id: crypto.randomUUID(),
      organizationId: membership.organizationId,
      userId: membership.userId,
      type,
      format,
      params,
      status: 'QUEUED',
      createdAt: new Date().toISOString(),
    };
    db.state.reportJobs.push(record);
    db.save();
    run(record.id);
    const origin = new URL(request.url).origin;
    return r.json(toJob(record, origin), 202, { Location: `/api/v1/reports/${record.id}` });
  }),

  // The report files (a stand-in document; the API renders the real one).
  http.get('*/mock-storage/reports/:reportId', ({ params }) => {
    const job = db.state.reportJobs.find((j) => j.id === params['reportId']);
    if (!job || job.status !== 'READY' || !job.fileName) {
      return new HttpResponse(null, { status: 404 });
    }
    const pdf = job.format === 'PDF';
    return new HttpResponse(
      pdf
        ? placeholderPdf(`Kora demo report: ${job.fileName}`)
        : `Kora demo report,${job.fileName}\n`,
      {
        headers: {
          'Content-Type': pdf
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${job.fileName}"`,
        },
      },
    );
  }),
];
