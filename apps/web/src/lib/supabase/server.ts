import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

function sharedAuthOptions() {
  return {
    autoRefreshToken: false,
    persistSession: false,
  } as const;
}

export function createSupabaseAdminClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      ...sharedAuthOptions(),
    },
  });
}

export function createSupabaseUserClient(accessToken: string) {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      ...sharedAuthOptions(),
    },
    accessToken: async () => accessToken,
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
