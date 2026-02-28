'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { simulationRequestSchema } from '@nyaya/shared';
import { runOrchestratedWarGame, runSingleAgentSimulation } from '@nyaya/agents';
import { canRunSimulation, requireAppUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { logAiAudit } from '@/lib/audit';
import { sanitizePlainText } from '@/lib/utils';

async function getCaseContext(caseId: string, ownerUserId: string) {
  const supabase = createSupabaseServerClient();
  const [res, docs] = await Promise.all([
    supabase
    .from('cases')
    .select('id,summary,title,court_name,jurisdiction,voice_transcript')
    .eq('id', caseId)
    .eq('owner_user_id', ownerUserId)
    .single(),
    supabase
      .from('case_documents')
      .select('parsed_text')
      .eq('case_id', caseId)
      .eq('owner_user_id', ownerUserId)
      .order('created_at', { ascending: false })
      .limit(15),
  ]);
  if (!res.data) throw new Error('Case not found');
  return {
    ...res.data,
    parsedDocumentTexts: (docs.data ?? [])
      .map((item) => item.parsed_text)
      .filter((text): text is string => typeof text === 'string' && text.trim().length >= 20),
  };
}

async function getUserLlmConfig(userId: string) {
  const supabase = createSupabaseServerClient();
  const settings = await supabase
    .from('user_settings')
    .select('llm_provider,llm_model,llm_api_key,llm_base_url,free_tier_only')
    .eq('owner_user_id', userId)
    .maybeSingle();

  if (settings.error || !settings.data) {
    return undefined;
  }

  return {
    provider: settings.data.llm_provider ?? 'sarvam',
    model: settings.data.llm_model ?? 'sarvam-m',
    apiKey: settings.data.llm_api_key ?? undefined,
    baseUrl: settings.data.llm_base_url ?? undefined,
    freeTierOnly: settings.data.free_tier_only ?? true,
  };
}

export async function runSingleAgentAction(formData: FormData) {
  const user = await requireAppUser();
  if (!canRunSimulation(user.role)) throw new Error('Only advocates/juniors/admins can run simulations.');
  await enforceRateLimit(`single-sim:${user.userId}`, 25);

  const caseId = String(formData.get('caseId') ?? '');
  const objective = sanitizePlainText(String(formData.get('objective') ?? ''));
  const caseSummary = await getCaseContext(caseId, user.userId);
  const llmConfig = await getUserLlmConfig(user.userId);

  const output = await runSingleAgentSimulation({
    caseId,
    objective,
    facts: caseSummary.summary,
    forum: caseSummary.court_name ?? null,
    jurisdiction: caseSummary.jurisdiction ?? null,
    parsedDocumentTexts: caseSummary.parsedDocumentTexts,
    voiceTranscript: caseSummary.voice_transcript ?? null,
    ...(llmConfig ? { llmConfig } : {}),
  });

  const supabase = createSupabaseServerClient();
  const simulationId = crypto.randomUUID();
  await supabase.from('simulations').insert({
    id: simulationId,
    owner_user_id: user.userId,
    case_id: caseId,
    mode: 'single_agent',
    headline: 'Single-agent baseline analysis',
    confidence: output.confidence,
    strategy_json: output,
  });

  await logAiAudit({
    caseId,
    userId: user.userId,
    runType: 'single_agent',
    prompt: `Single-agent objective: ${objective}`,
    response: output.analysis,
    confidence: output.confidence,
  });

  revalidatePath('/');
  revalidatePath(`/cases/${caseId}`);
  redirect(`/simulations/${simulationId}`);
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

  const caseSummary = await getCaseContext(payload.caseId, user.userId);
  const llmConfig = await getUserLlmConfig(user.userId);
  const output = await runOrchestratedWarGame({
    caseId: payload.caseId,
    summary: caseSummary.summary,
    objective: payload.objective,
    forum: caseSummary.court_name ?? null,
    jurisdiction: caseSummary.jurisdiction ?? null,
    parsedDocumentTexts: caseSummary.parsedDocumentTexts,
    voiceTranscript: caseSummary.voice_transcript ?? null,
    depth: payload.depth,
    ...(llmConfig ? { llmConfig } : {}),
  });

  const supabase = createSupabaseServerClient();
  const simulationId = crypto.randomUUID();
  await supabase.from('simulations').insert({
    id: simulationId,
    owner_user_id: user.userId,
    case_id: payload.caseId,
    mode: 'multi_agent',
    headline: output.headline,
    confidence: output.confidence,
    win_probability: output.winProbability,
    strategy_json: output,
  });

  await logAiAudit({
    caseId: payload.caseId,
    userId: user.userId,
    runType: 'multi_agent',
    prompt: `Multi-agent objective: ${payload.objective}`,
    response: JSON.stringify(output.rankedPlan),
    confidence: output.confidence,
  });

  revalidatePath('/');
  revalidatePath(`/cases/${payload.caseId}`);
  redirect(`/simulations/${simulationId}`);
}
