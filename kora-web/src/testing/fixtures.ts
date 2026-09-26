import { MeResponse, SessionResponse } from '../app/core/api/api.models';

export const ORG_A = '11111111-1111-4111-8111-111111111111';
export const ORG_B = '22222222-2222-4222-8222-222222222222';

export function aUser(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    id: 'u-1',
    email: 'aline@kora.demo',
    fullName: 'Aline Uwase',
    locale: 'en',
    memberships: [
      {
        organizationId: ORG_A,
        organizationName: 'Akagera',
        organizationSlug: 'akagera',
        role: 'ORG_ADMIN',
      },
      {
        organizationId: ORG_B,
        organizationName: 'Virunga',
        organizationSlug: 'virunga',
        role: 'PMO',
      },
    ],
    ...overrides,
  };
}

export function aSession(accessToken = 'token-1', expiresIn = 900): SessionResponse {
  return { accessToken, tokenType: 'Bearer', expiresIn, user: aUser() };
}

/** Body + init for `TestRequest.flush` answering with RFC 9457 Problem Details. */
export function problem(
  status: number,
  code: string,
  extra: { errors?: unknown[]; headers?: Record<string, string> } = {},
): [
  Record<string, unknown>,
  { status: number; statusText: string; headers?: Record<string, string> },
] {
  return [
    {
      type: `urn:kora:problem:${code}`,
      title: 'Error',
      status,
      code,
      correlationId: 'corr-1',
      ...extra,
    },
    { status, statusText: 'Error', headers: extra.headers },
  ];
}
