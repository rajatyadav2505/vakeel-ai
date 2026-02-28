import { auth, currentUser } from '@clerk/nextjs/server';
import type { Role } from '@nyaya/shared';

export interface AppUser {
  userId: string;
  role: Role;
  barCouncilId: string | null;
  fullName: string;
}

export async function requireAppUser(): Promise<AppUser> {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    throw new Error('Unauthenticated');
  }

  const user = await currentUser();
  const roleFromClaims = (sessionClaims?.metadata as { role?: string } | undefined)?.role;
  const role = (roleFromClaims?.toUpperCase() as Role | undefined) ?? 'ADVOCATE';
  const barCouncilId =
    ((sessionClaims?.metadata as { barCouncilId?: string } | undefined)?.barCouncilId as
      | string
      | undefined) ?? null;

  return {
    userId,
    role,
    barCouncilId,
    fullName: user?.fullName ?? 'Unknown User',
  };
}

export function canCreateCase(role: Role) {
  return role === 'ADVOCATE' || role === 'JUNIOR' || role === 'ADMIN';
}

export function canRunSimulation(role: Role) {
  return role !== 'CLIENT';
}
