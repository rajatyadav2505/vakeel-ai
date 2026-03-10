'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { simulationRequestSchema } from '@nyaya/shared';
import { canRunSimulation, requireAppUser } from '@/lib/auth';
import { createSupabaseUserClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { sanitizePlainText } from '@/lib/utils';

async function assertCaseOwnership(caseId: string, ownerUserId: string, accessToken: string) {
  const supabase = createSupabaseUserClient(accessToken);
  const res = await supabase
    .from('cases')
    .select('id')
    .eq('id', caseId)
    .eq('owner_user_id', ownerUserId)
    .single();

  if (!res.data) throw new Error('Case not found');
}

async function enqueueSimulationJob(params: {
  accessToken: string;
  ownerUserId: string;
  caseId: string;
  mode: 'single_agent' | 'multi_agent';
  objective: string;
  depth?: number;
  engineName?: 'legacy' | 'KAUTILYA_CERES';
  strategyMode?: 'robust_mode' | 'exploit_mode';
  computeMode?: 'fast' | 'standard' | 'full';
}) {
  const supabase = createSupabaseUserClient(params.accessToken);
  const result = await supabase
    .from('simulation_jobs')
    .insert({
      owner_user_id: params.ownerUserId,
      case_id: params.caseId,
      mode: params.mode,
      status: 'queued',
      objective: params.objective,
      depth: params.depth ?? null,
      payload: {
        objective: params.objective,
        ...(typeof params.depth === 'number' ? { depth: params.depth } : {}),
        ...(params.engineName ? { engineName: params.engineName } : {}),
        ...(params.strategyMode ? { strategyMode: params.strategyMode } : {}),
        ...(params.computeMode ? { computeMode: params.computeMode } : {}),
      },
      queued_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (result.error || !result.data) {
    throw new Error('Failed to enqueue simulation job. Run latest migrations and retry.');
  }

  return result.data.id as string;
}

async function getStrategySettings(userId: string, accessToken: string) {
  const supabase = createSupabaseUserClient(accessToken);
  const result = await supabase
    .from('user_settings')
    .select('kautilya_ceres_enabled,kautilya_ceres_default_mode,kautilya_ceres_compute_mode')
    .eq('owner_user_id', userId)
    .maybeSingle();

  return {
    kautilyaCeresEnabled: result.data?.kautilya_ceres_enabled ?? true,
    kautilyaCeresDefaultMode:
      result.data?.kautilya_ceres_default_mode === 'exploit_mode' ? 'exploit_mode' : 'robust_mode',
    kautilyaCeresComputeMode:
      result.data?.kautilya_ceres_compute_mode === 'fast'
        ? 'fast'
        : result.data?.kautilya_ceres_compute_mode === 'full'
          ? 'full'
          : 'standard',
  } as const;
}

export async function runSingleAgentAction(formData: FormData) {
  const user = await requireAppUser();
  if (!canRunSimulation(user.role))
    throw new Error('Only advocates/juniors/admins can run simulations.');
  await enforceRateLimit(`single-sim:${user.userId}`, 25);

  const caseId = String(formData.get('caseId') ?? '');
  const objective = sanitizePlainText(String(formData.get('objective') ?? ''));
  await assertCaseOwnership(caseId, user.userId, user.supabaseAccessToken);

  const jobId = await enqueueSimulationJob({
    accessToken: user.supabaseAccessToken,
    ownerUserId: user.userId,
    caseId,
    mode: 'single_agent',
    objective,
  });

  revalidatePath('/');
  revalidatePath(`/cases/${caseId}`);
  redirect(`/simulations?queuedJob=${jobId}`);
}

export async function runMultiAgentAction(formData: FormData) {
  const user = await requireAppUser();
  if (!canRunSimulation(user.role))
    throw new Error('Only advocates/juniors/admins can run simulations.');
  await enforceRateLimit(`multi-sim:${user.userId}`, 15);
  const strategySettings = await getStrategySettings(user.userId, user.supabaseAccessToken);

  const payload = simulationRequestSchema.parse({
    caseId: String(formData.get('caseId') ?? ''),
    objective: sanitizePlainText(String(formData.get('objective') ?? '')),
    depth: Number(formData.get('depth') ?? 7),
    includeMonteCarlo: true,
    includeChanakyaOverlay: true,
    engineName: String(
      formData.get('engineName') ??
        (strategySettings.kautilyaCeresEnabled ? 'KAUTILYA_CERES' : 'legacy'),
    ),
    strategyMode: String(formData.get('strategyMode') ?? strategySettings.kautilyaCeresDefaultMode),
    computeMode: String(formData.get('computeMode') ?? strategySettings.kautilyaCeresComputeMode),
  });

  if (payload.engineName === 'KAUTILYA_CERES' && !strategySettings.kautilyaCeresEnabled) {
    throw new Error('KAUTILYA_CERES is disabled in Settings.');
  }

  await assertCaseOwnership(payload.caseId, user.userId, user.supabaseAccessToken);

  const jobId = await enqueueSimulationJob({
    accessToken: user.supabaseAccessToken,
    ownerUserId: user.userId,
    caseId: payload.caseId,
    mode: 'multi_agent',
    objective: payload.objective,
    depth: payload.depth,
    engineName: payload.engineName,
    strategyMode: payload.strategyMode,
    computeMode: payload.computeMode,
  });

  revalidatePath('/');
  revalidatePath(`/cases/${payload.caseId}`);
  redirect(`/simulations?queuedJob=${jobId}`);
}
