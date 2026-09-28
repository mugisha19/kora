import { http, HttpResponse } from 'msw';
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_OWNER_TYPES,
  ATTACHMENT_TYPES,
  Attachment,
  AttachmentOwnerType,
} from '../../core/api/api.models';
import { AttachmentRecord } from '../data-activity';
import { MembershipRecord } from '../data';
import { db } from '../db';
import { API, Validator, invalidBody, latency, readBody, reply } from '../http';
import { canSee, userRef } from '../projects-domain';
import { manages, participates } from '../work-domain';
import { caller } from './portfolio.handlers';

/** Upload and download links last this long, like the API's presigned URLs. */
const UPLOAD_MINUTES = 15;
const DOWNLOAD_MINUTES = 5;

/**
 * The bytes "in storage" for this page's lifetime (a reload forgets them; seeded files download a
 * small stand-in). Keyed by storage key.
 */
const stored = new Map<string, Uint8Array<ArrayBuffer>>();

function projectOfOwner(ownerType: AttachmentOwnerType, ownerId: string): string | undefined {
  const s = db.state;
  switch (ownerType) {
    case 'PROJECT':
      return s.projects.find((p) => p.id === ownerId)?.id;
    case 'TASK':
      return s.tasks.find((t) => t.id === ownerId)?.projectId;
    case 'RISK':
      return s.risks.find((r) => r.id === ownerId)?.projectId;
    case 'ISSUE':
      return s.issues.find((i) => i.id === ownerId)?.projectId;
    case 'CHANGE_REQUEST':
      return s.changeRequests.find((c) => c.id === ownerId)?.projectId;
  }
}

function projectFor(membership: MembershipRecord, projectId: string | undefined) {
  const project = projectId ? db.state.projects.find((p) => p.id === projectId) : undefined;
  return project && canSee(project, membership) ? project : undefined;
}

export function toAttachment(record: AttachmentRecord): Attachment {
  return {
    id: record.id,
    ownerType: record.ownerType,
    ownerId: record.ownerId,
    projectId: record.projectId,
    fileName: record.fileName,
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    ...(record.sha256 ? { sha256: record.sha256 } : {}),
    status: record.status,
    scanStatus: record.scanStatus,
    uploadedBy: userRef(record.uploadedById),
    uploadedAt: record.uploadedAt,
  };
}

const extensionOf = (fileName: string) =>
  /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? '';

/** What the bytes are, by their signature, as the API's content detection decides. */
function sniff(bytes: Uint8Array): 'pdf' | 'png' | 'jpeg' | 'gif' | 'webp' | 'zip' | 'text' | null {
  const at = (signature: number[], offset = 0) =>
    signature.every((b, i) => bytes[offset + i] === b);
  if (at([0x25, 0x50, 0x44, 0x46])) return 'pdf';
  if (at([0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (at([0xff, 0xd8, 0xff])) return 'jpeg';
  if (at([0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (at([0x52, 0x49, 0x46, 0x46]) && at([0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  if (at([0x50, 0x4b, 0x03, 0x04])) return 'zip';
  const head = bytes.subarray(0, 4096);
  const binary = head.some((b) => b < 32 && b !== 9 && b !== 10 && b !== 13);
  return binary ? null : 'text';
}

const EXPECTED: Record<string, ReturnType<typeof sniff>> = {
  pdf: 'pdf',
  png: 'png',
  jpg: 'jpeg',
  jpeg: 'jpeg',
  gif: 'gif',
  webp: 'webp',
  docx: 'zip',
  xlsx: 'zip',
  pptx: 'zip',
  txt: 'text',
  csv: 'text',
};

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A minimal valid PDF, standing in for files uploaded before this page loaded. */
export function placeholderPdf(title: string): string {
  const text = title.replace(/[()\\]/g, '');
  return [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${text.length + 40} >> stream`,
    `BT /F1 18 Tf 72 770 Td (${text}) Tj ET`,
    'endstream endobj',
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    'trailer << /Root 1 0 R >>',
    '%%EOF',
  ].join('\n');
}

/** Feature 20: attachments, and the object store their presigned links point at. */
export const attachmentHandlers = [
  http.get(`${API}/attachments`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const url = new URL(request.url);
    const ownerType = url.searchParams.get('ownerType');
    const ownerId = url.searchParams.get('ownerId');
    const v = new Validator();
    if (!ATTACHMENT_OWNER_TYPES.includes(ownerType as AttachmentOwnerType)) {
      v.add('ownerType', 'invalid', 'is not an owner type');
    }
    v.uuid('ownerId', ownerId ?? undefined, true);
    if (!v.ok) return v.problem(r);
    const project = projectFor(
      membership,
      projectOfOwner(ownerType as AttachmentOwnerType, ownerId ?? ''),
    );
    if (!project) return r.problem(404, 'resource.not_found');
    return r.json(
      db.state.attachments
        .filter(
          (a) =>
            a.organizationId === membership.organizationId &&
            a.ownerType === ownerType &&
            a.ownerId === ownerId &&
            a.status === 'AVAILABLE' &&
            !a.deletedAt,
        )
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))
        .map(toAttachment),
    );
  }),

  http.post(`${API}/attachments/uploads`, async ({ request }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const body = await readBody(request);
    if (!body) return invalidBody(r);
    const v = new Validator();
    const ownerType = body['ownerType'] as AttachmentOwnerType;
    if (!ATTACHMENT_OWNER_TYPES.includes(ownerType)) {
      v.add('ownerType', 'invalid', 'is not an owner type');
    }
    v.uuid('ownerId', body['ownerId'], true);
    v.string('fileName', body['fileName'], 1, 255);
    v.string('contentType', body['contentType'], 1, 255);
    const size = body['sizeBytes'];
    if (typeof size !== 'number' || !Number.isInteger(size) || size < 1) {
      v.add('sizeBytes', 'invalid', 'must be a positive whole number');
    } else if (size > ATTACHMENT_MAX_BYTES) {
      v.add('sizeBytes', 'range', 'is larger than the limit', { max: ATTACHMENT_MAX_BYTES });
    }
    const fileName = typeof body['fileName'] === 'string' ? body['fileName'] : '';
    const extension = extensionOf(fileName);
    if (fileName && !ATTACHMENT_TYPES[extension]) {
      v.add('fileName', 'type', 'this file type is not accepted');
    } else if (fileName && body['contentType'] !== ATTACHMENT_TYPES[extension]) {
      v.add('contentType', 'invalid', 'does not match the file name');
    }
    if (!v.ok) return v.problem(r);
    const project = projectFor(membership, projectOfOwner(ownerType, body['ownerId'] as string));
    if (!project) return r.problem(404, 'resource.not_found');
    if (!participates(project, membership)) return r.problem(403, 'access.denied');

    const record: AttachmentRecord = {
      id: crypto.randomUUID(),
      organizationId: membership.organizationId,
      ownerType,
      ownerId: body['ownerId'] as string,
      projectId: project.id,
      fileName,
      contentType: body['contentType'] as string,
      sizeBytes: size as number,
      status: 'PENDING',
      scanStatus: 'NOT_SCANNED',
      uploadedById: membership.userId,
      uploadedAt: new Date().toISOString(),
      storageKey: `${membership.organizationId}/${crypto.randomUUID()}`,
    };
    db.state.attachments.push(record);
    db.save();
    const origin = new URL(request.url).origin;
    return r.json(
      {
        attachment: toAttachment(record),
        uploadUrl: `${origin}/mock-storage/uploads/${encodeURIComponent(record.storageKey)}`,
        uploadMethod: 'PUT',
        uploadHeaders: { 'Content-Type': record.contentType },
        expiresAt: new Date(Date.now() + UPLOAD_MINUTES * 60_000).toISOString(),
      },
      201,
    );
  }),

  http.post(`${API}/attachments/:attachmentId/complete`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const record = db.state.attachments.find(
      (a) =>
        a.id === params['attachmentId'] &&
        a.organizationId === membership.organizationId &&
        !a.deletedAt,
    );
    if (!record || !projectFor(membership, record.projectId)) {
      return r.problem(404, 'resource.not_found');
    }
    if (record.status === 'AVAILABLE') return r.problem(409, 'attachments.already_completed');
    const bytes = stored.get(record.storageKey);
    if (!bytes) return r.problem(409, 'attachments.not_uploaded');
    const kind = sniff(bytes);
    if (bytes.length !== record.sizeBytes || kind !== EXPECTED[extensionOf(record.fileName)]) {
      // The API deletes a file that isn't what it claims to be; the upload starts over.
      stored.delete(record.storageKey);
      record.deletedAt = new Date().toISOString();
      db.save();
      return r.problem(409, 'attachments.content_mismatch');
    }
    record.status = 'AVAILABLE';
    record.sha256 = await sha256(bytes);
    db.save();
    return r.json(toAttachment(record));
  }),

  http.get(`${API}/attachments/:attachmentId/download`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const record = db.state.attachments.find(
      (a) =>
        a.id === params['attachmentId'] &&
        a.organizationId === membership.organizationId &&
        a.status === 'AVAILABLE' &&
        !a.deletedAt,
    );
    if (!record || !projectFor(membership, record.projectId)) {
      return r.problem(404, 'resource.not_found');
    }
    const origin = new URL(request.url).origin;
    return r.json({
      url: `${origin}/mock-storage/files/${encodeURIComponent(record.storageKey)}`,
      expiresAt: new Date(Date.now() + DOWNLOAD_MINUTES * 60_000).toISOString(),
    });
  }),

  http.delete(`${API}/attachments/:attachmentId`, async ({ request, params }) => {
    await latency();
    const r = reply(request);
    const membership = caller(request, r);
    if (membership instanceof Response) return membership;
    const record = db.state.attachments.find(
      (a) =>
        a.id === params['attachmentId'] &&
        a.organizationId === membership.organizationId &&
        !a.deletedAt,
    );
    const project = record ? projectFor(membership, record.projectId) : undefined;
    if (!record || !project) return r.problem(404, 'resource.not_found');
    if (record.uploadedById !== membership.userId && !manages(project, membership)) {
      return r.problem(403, 'access.denied');
    }
    // Soft delete: the API purges the file after 30 days.
    record.deletedAt = new Date().toISOString();
    db.save();
    return r.empty();
  }),

  // ---------- The object store behind the presigned links (no Authorization) ----------

  http.put('*/mock-storage/uploads/:storageKey', async ({ request, params }) => {
    await latency();
    const key = decodeURIComponent(String(params['storageKey']));
    const record = db.state.attachments.find((a) => a.storageKey === key && !a.deletedAt);
    if (!record || record.status !== 'PENDING') return new HttpResponse(null, { status: 403 });
    if (request.headers.get('Content-Type') !== record.contentType) {
      return new HttpResponse(null, { status: 403 });
    }
    stored.set(key, new Uint8Array(await request.arrayBuffer()));
    return new HttpResponse(null, { status: 200 });
  }),

  http.get('*/mock-storage/files/:storageKey', ({ params }) => {
    const key = decodeURIComponent(String(params['storageKey']));
    const record = db.state.attachments.find((a) => a.storageKey === key && !a.deletedAt);
    if (!record) return new HttpResponse(null, { status: 404 });
    const bytes =
      stored.get(key) ??
      new TextEncoder().encode(
        record.contentType === 'application/pdf'
          ? placeholderPdf(record.fileName)
          : `Kora demo file: ${record.fileName}\n`,
      );
    return new HttpResponse(bytes, {
      headers: {
        'Content-Type': record.contentType,
        'Content-Disposition': `attachment; filename="${record.fileName.replace(/"/g, '')}"`,
      },
    });
  }),
];
