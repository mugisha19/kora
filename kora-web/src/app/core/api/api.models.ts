/**
 * Hand-written types for API contract 0.1.0, agreed with the kora-api team until
 * `kora-api/docs/openapi.yaml` exists; they will be replaced by the generated client.
 */

export const ROLES = ['ORG_ADMIN', 'PMO', 'PROJECT_MANAGER', 'MEMBER', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export const LOCALES = ['en', 'fr', 'rw'] as const;
export type Locale = (typeof LOCALES)[number];

export interface MembershipSummary {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: Role;
}

export interface MeResponse {
  id: string;
  email: string;
  fullName: string;
  locale: Locale;
  memberships: MembershipSummary[];
}

export interface SessionResponse {
  accessToken: string;
  tokenType: 'Bearer';
  /** Seconds until the access token expires. */
  expiresIn: number;
  user: MeResponse;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterOrganizationRequest {
  organizationName: string;
  fullName: string;
  email: string;
  password: string;
  currency?: string;
  timeZone?: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface UpdateMeRequest {
  fullName?: string;
  locale?: Locale;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  currency: string;
  timeZone: string;
  createdAt: string;
  version: number;
}

export interface UpdateOrganizationRequest {
  name?: string;
  currency?: string;
  timeZone?: string;
}

export interface Member {
  /** Membership id. */
  id: string;
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  joinedAt: string;
  version: number;
}

export const INVITATION_STATUSES = ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export interface Invitation {
  id: string;
  email: string;
  role: Role;
  status: InvitationStatus;
  invitedByName: string;
  createdAt: string;
  expiresAt: string;
}

export interface CreateInvitationRequest {
  email: string;
  role: Role;
}

export interface InvitationPreview {
  organizationName: string;
  email: string;
  role: Role;
  invitedByName: string;
  expiresAt: string;
  existingAccount: boolean;
}

export interface AcceptInvitationRequest {
  fullName?: string;
  password: string;
}

/** Offset pagination (page is 0-based). */
export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface PageRequest {
  page?: number;
  size?: number;
  /** `field,asc|desc`; repeatable. */
  sort?: string | string[];
}

export interface ProblemFieldError {
  field: string;
  code: string;
  message?: string;
}

/** RFC 9457 Problem Details with Kora extensions. */
export interface ProblemDetail {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  instance?: string;
  code?: string;
  correlationId?: string;
  errors?: ProblemFieldError[];
}
