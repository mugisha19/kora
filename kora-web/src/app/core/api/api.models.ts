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
