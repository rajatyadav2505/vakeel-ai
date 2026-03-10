import { auth, currentUser } from '@clerk/nextjs/server';
import type { Role } from '@nyaya/shared';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

const DEFAULT_SUPABASE_JWT_TEMPLATE = 'supabase';

export interface AppUser {
  userId: string;
  role: Role;
  barCouncilId: string | null;
  fullName: string;
  supabaseAccessToken: string;
}

async function ensureProfileRow(user: Omit<AppUser, 'supabaseAccessToken'>) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from('profiles').upsert(
    {
      clerk_user_id: user.userId,
      role: user.role,
      full_name: user.fullName,
      bar_council_id: user.barCouncilId,
    },
    { onConflict: 'clerk_user_id' },
  );

  if (error) {
    throw new Error(`Failed to sync profile: ${error.message}`);
  }
}

export async function requireAppUser(): Promise<AppUser> {
  const { userId, sessionClaims, getToken } = await auth();
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
  const supabaseJwtTemplate =
    process.env.CLERK_SUPABASE_JWT_TEMPLATE?.trim() || DEFAULT_SUPABASE_JWT_TEMPLATE;
  const supabaseAccessToken = await getToken({ template: supabaseJwtTemplate });
  if (!supabaseAccessToken) {
    throw new Error(
      `Missing Clerk Supabase JWT. Configure the Clerk JWT template "${supabaseJwtTemplate}" and retry.`,
    );
  }

  const appUserWithoutToken = {
    userId,
    role,
    barCouncilId,
    fullName: user?.fullName ?? 'Unknown User',
  };
  await ensureProfileRow(appUserWithoutToken);

  return {
    ...appUserWithoutToken,
    supabaseAccessToken,
  };
}

export function canCreateCase(role: Role) {
  return role === 'ADVOCATE' || role === 'JUNIOR' || role === 'ADMIN';
}

export function canRunSimulation(role: Role) {
  return role !== 'CLIENT';
}
