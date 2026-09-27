import { MeResponse, Member } from '../core/api/api.models';
import { PROJECT, ProjectSeed, createProjectSeed } from './data-projects';
import { GovernanceSeed, createGovernanceSeed } from './data-governance';
import { TimeSeed, createTimeSeed } from './data-time';
import { ScheduleSeed, createScheduleSeed } from './data-schedule';
import { WorkSeed, createWorkSeed } from './data-work';
import {
  InvitationRecord,
  MembershipRecord,
  OrganizationRecord,
  SeedData,
  UserRecord,
  createSeed,
} from './data';

export interface RefreshTokenRecord {
  token: string;
  userId: string;
  /** All tokens rotated from one sign-in share a family; reuse of a rotated one revokes it. */
  familyId: string;
  status: 'active' | 'rotated' | 'revoked';
  /** When it was rotated; reuse within a short grace period is a two-tab race, not theft. */
  rotatedAt?: number;
}

export interface ResetTokenRecord {
  token: string;
  userId: string;
  expiresAt: number;
  used: boolean;
}

export interface MockState
  extends SeedData, ProjectSeed, WorkSeed, ScheduleSeed, GovernanceSeed, TimeSeed {
  refreshTokens: RefreshTokenRecord[];
  resetTokens: ResetTokenRecord[];
  /** Sign-in token buckets per lower-cased email, for the rate limit. */
  loginBuckets: Record<string, { tokens: number; updatedAt: number }>;
}

/** Unwraps a lookup that the mock's own data guarantees; a miss is a bug in the mock. */
export function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Mock data is missing ${what}`);
  return value;
}

const STORAGE_KEY = 'kora.mock.db.v7';

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * In-browser database for mock mode. State is saved to localStorage after every change, so a page
 * reload keeps the session (like the real refresh cookie) and the data you changed.
 * `window.koraMock.reset()` restores the demo data.
 */
export class MockDb {
  state: MockState = this.load();

  reset(): void {
    this.state = this.fresh();
    this.save();
  }

  save(): void {
    try {
      storage()?.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Storage full or blocked: mock data just won't survive a reload.
    }
  }

  userByEmail(email: string): UserRecord | undefined {
    const wanted = email.trim().toLowerCase();
    return this.state.users.find((u) => u.email.toLowerCase() === wanted);
  }

  user(id: string): UserRecord | undefined {
    return this.state.users.find((u) => u.id === id);
  }

  organization(id: string): OrganizationRecord | undefined {
    return this.state.organizations.find((o) => o.id === id);
  }

  membership(userId: string, organizationId: string): MembershipRecord | undefined {
    return this.state.memberships.find(
      (m) => m.userId === userId && m.organizationId === organizationId,
    );
  }

  invitationByToken(token: string): InvitationRecord | undefined {
    return this.state.invitations.find((i) => i.token === token);
  }

  me(userId: string): MeResponse {
    const user = this.user(userId);
    if (!user) throw new Error(`Unknown mock user ${userId}`);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      locale: user.locale,
      memberships: this.state.memberships
        .filter((m) => m.userId === userId)
        .map((m) => {
          const org = must(this.organization(m.organizationId), `organization ${m.organizationId}`);
          return {
            organizationId: org.id,
            organizationName: org.name,
            organizationSlug: org.slug,
            role: m.role,
          };
        }),
    };
  }

  member(record: MembershipRecord): Member {
    const user = must(this.user(record.userId), `user ${record.userId}`);
    return {
      id: record.id,
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      role: record.role,
      joinedAt: record.joinedAt,
      version: record.version,
    };
  }

  /** Pending invitations past their expiry date become EXPIRED (the API does this on a schedule). */
  expireInvitations(now = Date.now()): void {
    let changed = false;
    for (const invitation of this.state.invitations) {
      if (invitation.status === 'PENDING' && Date.parse(invitation.expiresAt) < now) {
        invitation.status = 'EXPIRED';
        changed = true;
      }
    }
    if (changed) this.save();
  }

  private load(): MockState {
    try {
      const saved = storage()?.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved) as MockState;
    } catch {
      // Corrupt or unreadable: start from the demo data.
    }
    return this.fresh();
  }

  private fresh(): MockState {
    const now = Date.now();
    const projects = createProjectSeed(now);
    const work = createWorkSeed(now);
    const warehouse = must(
      projects.projects.find((p) => p.id === PROJECT.warehouse),
      'warehouse project',
    );
    const schedule = createScheduleSeed(now, warehouse.startDate);
    return {
      ...createSeed(),
      ...projects,
      ...work,
      tasks: [...work.tasks, ...schedule.tasks],
      dependencies: schedule.dependencies,
      baselines: schedule.baselines,
      calendars: schedule.calendars,
      ...createGovernanceSeed(now),
      ...createTimeSeed(now, work.tasks),
      refreshTokens: [],
      resetTokens: [],
      loginBuckets: {},
    };
  }
}

export const db = new MockDb();
