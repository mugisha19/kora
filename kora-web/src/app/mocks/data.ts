import { InvitationStatus, Locale, Role } from '../core/api/api.models';

/**
 * Demo data for mock mode (feature 22). Everything is fictional. The kora-api demo seeder mirrors
 * the same people and organizations, so mock mode and the real API look alike.
 */

export const DEMO_PASSWORD = 'KoraDemo!2026';

export interface UserRecord {
  id: string;
  email: string;
  fullName: string;
  locale: Locale;
  password: string;
}

export interface OrganizationRecord {
  id: string;
  name: string;
  slug: string;
  currency: string;
  timeZone: string;
  createdAt: string;
  version: number;
}

export interface MembershipRecord {
  id: string;
  userId: string;
  organizationId: string;
  role: Role;
  joinedAt: string;
  version: number;
}

export interface InvitationRecord {
  id: string;
  organizationId: string;
  email: string;
  role: Role;
  status: InvitationStatus;
  invitedByUserId: string;
  createdAt: string;
  expiresAt: string;
  token: string;
}

export const ORG_AKAGERA = '0b7c5a52-5c2e-4f0e-9a51-1f6d2c3b4a01';
export const ORG_VIRUNGA = '0b7c5a52-5c2e-4f0e-9a51-1f6d2c3b4a02';

export const USER = {
  admin: '6f1e2d3c-4b5a-4c6d-8e7f-000000000001',
  pmo: '6f1e2d3c-4b5a-4c6d-8e7f-000000000002',
  pm: '6f1e2d3c-4b5a-4c6d-8e7f-000000000003',
  member: '6f1e2d3c-4b5a-4c6d-8e7f-000000000004',
  viewer: '6f1e2d3c-4b5a-4c6d-8e7f-000000000005',
} as const;

/** One-click demo accounts shown on the sign-in page (`showDemoLogins`). */
export const DEMO_ACCOUNTS: readonly { email: string; role: Role }[] = [
  { email: 'admin@kora.demo', role: 'ORG_ADMIN' },
  { email: 'pmo@kora.demo', role: 'PMO' },
  { email: 'pm@kora.demo', role: 'PROJECT_MANAGER' },
  { email: 'member@kora.demo', role: 'MEMBER' },
  { email: 'viewer@kora.demo', role: 'VIEWER' },
];

/** Invitation links to try the accept flow in mock mode: /invitations/<token>. */
export const DEMO_INVITATION_TOKENS = {
  newAccount: 'demo-invite-new-account-0001',
  existingAccount: 'demo-invite-existing-account-0002',
  expired: 'demo-invite-expired-account-0003',
} as const;

/** Stand-in for the API's breached-password check. */
export const BREACHED_PASSWORDS = new Set([
  'password1234',
  'qwerty123456',
  '123456789012',
  'iloveyou1234',
  'passwordpassword',
]);

const DAY = 86_400_000;

function uuid(n: number, prefix = '8a1b2c3d-0000-4000-8000'): string {
  return `${prefix}-${n.toString().padStart(12, '0')}`;
}

/** Additional Akagera members so paging, search and sorting have something to work on. */
const MORE_PEOPLE: readonly [string, Role][] = [
  ['Alice Umutoni', 'PROJECT_MANAGER'],
  ['Bosco Niyonsaba', 'MEMBER'],
  ['Chantal Mukeshimana', 'MEMBER'],
  ['David Hakizimana', 'PMO'],
  ['Esther Uwamahoro', 'MEMBER'],
  ['Fabrice Ndayisaba', 'VIEWER'],
  ['Gloria Iradukunda', 'MEMBER'],
  ['Herve Munyaneza', 'PROJECT_MANAGER'],
  ['Immaculee Nyirahabimana', 'MEMBER'],
  ['Janvier Kwizera', 'MEMBER'],
  ['Kevine Umurerwa', 'VIEWER'],
  ['Laurent Twagirumukiza', 'MEMBER'],
  ['Marie Claire Uwineza', 'MEMBER'],
  ['Norbert Rukundo', 'MEMBER'],
  ['Odette Mukamurenzi', 'PROJECT_MANAGER'],
  ['Pacifique Irakoze', 'MEMBER'],
  ['Queen Ishimwe', 'MEMBER'],
  ['Robert Nkurunziza', 'VIEWER'],
];

function emailOf(fullName: string): string {
  return `${fullName.toLowerCase().replace(/\s+/g, '.')}@akagera.example`;
}

export interface SeedData {
  users: UserRecord[];
  organizations: OrganizationRecord[];
  memberships: MembershipRecord[];
  invitations: InvitationRecord[];
}

export function createSeed(now = Date.now()): SeedData {
  const at = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();

  const users: UserRecord[] = [
    {
      id: USER.admin,
      email: 'admin@kora.demo',
      fullName: 'Aline Uwase',
      locale: 'en',
      password: DEMO_PASSWORD,
    },
    {
      id: USER.pmo,
      email: 'pmo@kora.demo',
      fullName: 'Jean-Paul Habimana',
      locale: 'fr',
      password: DEMO_PASSWORD,
    },
    {
      id: USER.pm,
      email: 'pm@kora.demo',
      fullName: 'Grace Mukamana',
      locale: 'en',
      password: DEMO_PASSWORD,
    },
    {
      id: USER.member,
      email: 'member@kora.demo',
      fullName: 'Eric Nshimiyimana',
      locale: 'rw',
      password: DEMO_PASSWORD,
    },
    {
      id: USER.viewer,
      email: 'viewer@kora.demo',
      fullName: 'Diane Ingabire',
      locale: 'en',
      password: DEMO_PASSWORD,
    },
    {
      id: uuid(900, '6f1e2d3c-4b5a-4c6d-8e7f'),
      email: 'olivier.hakizimana@virunga.example',
      fullName: 'Olivier Hakizimana',
      locale: 'fr',
      password: DEMO_PASSWORD,
    },
    ...MORE_PEOPLE.map(([fullName], index) => ({
      id: uuid(100 + index, '6f1e2d3c-4b5a-4c6d-8e7f'),
      email: emailOf(fullName),
      fullName,
      locale: 'en' as Locale,
      password: DEMO_PASSWORD,
    })),
  ];

  const organizations: OrganizationRecord[] = [
    {
      id: ORG_AKAGERA,
      name: 'Akagera Digital Ltd',
      slug: 'akagera-digital-ltd',
      currency: 'RWF',
      timeZone: 'Africa/Kigali',
      createdAt: at(400),
      version: 1,
    },
    {
      id: ORG_VIRUNGA,
      name: 'Virunga Build Partners',
      slug: 'virunga-build-partners',
      currency: 'RWF',
      timeZone: 'Africa/Kigali',
      createdAt: at(300),
      version: 1,
    },
  ];

  let membershipNo = 1;
  const membership = (
    userId: string,
    organizationId: string,
    role: Role,
    daysAgo: number,
  ): MembershipRecord => ({
    id: uuid(membershipNo++, '4d3c2b1a-9f8e-4d7c-a6b5'),
    userId,
    organizationId,
    role,
    joinedAt: at(daysAgo),
    version: 1,
  });

  const memberships: MembershipRecord[] = [
    membership(USER.admin, ORG_AKAGERA, 'ORG_ADMIN', 400),
    membership(USER.pmo, ORG_AKAGERA, 'PMO', 380),
    membership(USER.pm, ORG_AKAGERA, 'PROJECT_MANAGER', 350),
    membership(USER.member, ORG_AKAGERA, 'MEMBER', 300),
    membership(USER.viewer, ORG_AKAGERA, 'VIEWER', 200),
    ...MORE_PEOPLE.map(([, role], index) =>
      membership(uuid(100 + index, '6f1e2d3c-4b5a-4c6d-8e7f'), ORG_AKAGERA, role, 290 - index * 12),
    ),
    // Virunga shows multi-tenancy: the demo admin is PMO there (feature 22).
    membership(uuid(900, '6f1e2d3c-4b5a-4c6d-8e7f'), ORG_VIRUNGA, 'ORG_ADMIN', 300),
    membership(USER.admin, ORG_VIRUNGA, 'PMO', 250),
  ];

  let invitationNo = 1;
  const invitation = (
    organizationId: string,
    email: string,
    role: Role,
    status: InvitationStatus,
    createdDaysAgo: number,
    token: string,
    invitedByUserId: string = USER.admin,
  ): InvitationRecord => ({
    id: uuid(invitationNo++, '9e8d7c6b-5a4b-4c3d-b2a1'),
    organizationId,
    email,
    role,
    status,
    invitedByUserId,
    createdAt: at(createdDaysAgo),
    expiresAt: at(createdDaysAgo - 14),
    token,
  });

  const invitations: InvitationRecord[] = [
    invitation(
      ORG_AKAGERA,
      'new.person@example.com',
      'MEMBER',
      'PENDING',
      2,
      DEMO_INVITATION_TOKENS.newAccount,
    ),
    invitation(
      ORG_AKAGERA,
      'sandrine.uwera@example.com',
      'PROJECT_MANAGER',
      'PENDING',
      5,
      'demo-invite-pending-sandrine-0004',
    ),
    invitation(
      ORG_AKAGERA,
      'kevin.mutabazi@example.com',
      'VIEWER',
      'PENDING',
      9,
      'demo-invite-pending-kevin-0005',
    ),
    invitation(
      ORG_AKAGERA,
      'old.contractor@example.com',
      'MEMBER',
      'EXPIRED',
      30,
      DEMO_INVITATION_TOKENS.expired,
    ),
    invitation(
      ORG_AKAGERA,
      'wrong.address@example.com',
      'MEMBER',
      'REVOKED',
      20,
      'demo-invite-revoked-0006',
    ),
    invitation(
      ORG_AKAGERA,
      emailOf('Queen Ishimwe'),
      'MEMBER',
      'ACCEPTED',
      60,
      'demo-invite-accepted-0007',
    ),
    // An existing Kora user (member@kora.demo) invited into a second organization.
    invitation(
      ORG_VIRUNGA,
      'member@kora.demo',
      'MEMBER',
      'PENDING',
      1,
      DEMO_INVITATION_TOKENS.existingAccount,
      uuid(900, '6f1e2d3c-4b5a-4c6d-8e7f'),
    ),
  ];

  return { users, organizations, memberships, invitations };
}
