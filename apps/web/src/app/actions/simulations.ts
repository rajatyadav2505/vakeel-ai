'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { simulationRequestSchema } from '@nyaya/shared';
import { canRunSimulation, requireAppUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { sanitizePlainText } from '@/lib/utils';

async function assertCaseOwnership(caseId: string, ownerUserId: string) {
  const supabase = createSupabaseServerClient();
  const res = await supabase
    .from('cases')
    .select('id')
    .eq('id', caseId)
    .eq('owner_user_id', ownerUserId)
    .single();

  if (!res.data) throw new Error('Case not found');
}

async function enqueueSimulationJob(params: {
  ownerUserId: string;
  caseId: string;
  mode: 'single_agent' | 'multi_agent';
  objective: string;
  depth?: number;
}) {
  const supabase = createSupabaseServerClient();
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

export async function runSingleAgentAction(formData: FormData) {
  const user = await requireAppUser();
  if (!canRunSimulation(user.role)) throw new Error('Only advocates/juniors/admins can run simulations.');
  await enforceRateLimit(`single-sim:${user.userId}`, 25);

  const caseId = String(formData.get('caseId') ?? '');
  const objective = sanitizePlainText(String(formData.get('objective') ?? ''));
  await assertCaseOwnership(caseId, user.userId);

  const jobId = await enqueueSimulationJob({
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
  if (!canRunSimulation(user.role)) throw new Error('Only advocates/juniors/admins can run simulations.');
  await enforceRateLimit(`multi-sim:${user.userId}`, 15);

  const payload = simulationRequestSchema.parse({
    caseId: String(formData.get('caseId') ?? ''),
    objective: sanitizePlainText(String(formData.get('objective') ?? '')),
    depth: Number(formData.get('depth') ?? 7),
    includeMonteCarlo: true,
    includeChanakyaOverlay: true,
  });

  await assertCaseOwnership(payload.caseId, user.userId);

  const jobId = await enqueueSimulationJob({
    ownerUserId: user.userId,
    caseId: payload.caseId,
    mode: 'multi_agent',
    objective: payload.objective,
    depth: payload.depth,
  });

  revalidatePath('/');
  revalidatePath(`/cases/${payload.caseId}`);
  redirect(`/simulations?queuedJob=${jobId}`);
}
