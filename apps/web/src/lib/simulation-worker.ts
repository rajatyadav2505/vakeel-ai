import { runKautilyaCeresWarGame, runOrchestratedWarGame, runSingleAgentSimulation } from '@nyaya/agents';
import type { DocumentType } from '@nyaya/shared';
import { resolveRuntimeLlmConfig } from '@/lib/llm-settings';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { persistKautilyaStrategyRun } from '@/lib/strategy-run-persistence';

interface SimulationJobRow {
  id: string;
  owner_user_id: string;
  case_id: string;
  mode: 'single_agent' | 'multi_agent';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  objective: string;
  depth: number | null;
  payload?: {
    objective?: string;
    depth?: number;
    engineName?: 'legacy' | 'KAUTILYA_CERES';
    strategyMode?: 'robust_mode' | 'exploit_mode';
    computeMode?: 'fast' | 'standard' | 'full';
  } | null;
  attempts: number;
}

interface CaseContext {
  id: string;
  title: string;
  summary: string;
  court_name: string | null;
  jurisdiction: string | null;
  voice_transcript: string | null;
  parsedDocumentTexts: string[];
  documents: Array<{
    id: string;
    name: string;
    documentType: string;
    text: string | null;
  }>;
}

const DOCUMENT_TYPES: DocumentType[] = [
  'unknown',
  'petition',
  'affidavit',
  'notice',
  'order',
  'agreement',
  'postal_proof',
  'receipt',
  'annexure',
  'evidence',
  'audio_note',
];

function toDocumentType(value: string): DocumentType {
  return DOCUMENT_TYPES.includes(value as DocumentType) ? (value as DocumentType) : 'unknown';
}

async function getCaseContext(caseId: string, ownerUserId: string): Promise<CaseContext> {
  const supabase = createSupabaseAdminClient();
  const [res, docs] = await Promise.all([
    supabase
      .from('cases')
      .select('id,title,summary,court_name,jurisdiction,voice_transcript')
      .eq('id', caseId)
      .eq('owner_user_id', ownerUserId)
      .single(),
    supabase
      .from('case_documents')
      .select('id,file_name,document_type,parsed_text')
      .eq('case_id', caseId)
      .eq('owner_user_id', ownerUserId)
      .order('created_at', { ascending: false })
      .limit(15),
  ]);

  if (!res.data) {
    throw new Error('Case context not found for queued simulation job.');
  }

  return {
    ...res.data,
    parsedDocumentTexts: (docs.data ?? [])
      .map((item) => item.parsed_text)
      .filter((text): text is string => typeof text === 'string' && text.trim().length >= 20),
    documents: (docs.data ?? []).map((item) => ({
      id: item.id,
      name: item.file_name,
      documentType: item.document_type,
      text: item.parsed_text,
    })),
  };
}

async function getUserLlmConfig(userId: string) {
  const supabase = createSupabaseAdminClient();
  const settings = await supabase
    .from('user_settings')
    .select('llm_provider,llm_model,llm_api_key,llm_base_url,free_tier_only,preferred_language')
    .eq('owner_user_id', userId)
    .maybeSingle();

  if (settings.error || !settings.data) {
    return undefined;
  }

  return resolveRuntimeLlmConfig(settings.data);
}

async function insertAuditLog(params: {
  caseId: string;
  userId: string;
  runType: 'single_agent' | 'multi_agent';
  prompt: string;
  response: string;
  confidence: number;
}) {
  const supabase = createSupabaseAdminClient();
  await supabase.from('ai_audit_logs').insert({
    id: crypto.randomUUID(),
    case_id: params.caseId,
    user_id: params.userId,
    run_type: params.runType,
    prompt: params.prompt,
    response: params.response,
    confidence: params.confidence,
  });
}

async function markJobStatus(params: {
  jobId: string;
  status: 'processing' | 'completed' | 'failed';
  attempts: number;
  resultSimulationId?: string | null;
  errorMessage?: string | null;
}) {
  const supabase = createSupabaseAdminClient();
  await supabase
    .from('simulation_jobs')
    .update({
      status: params.status,
      attempts: params.attempts,
      result_simulation_id: params.resultSimulationId ?? null,
      last_error: params.errorMessage ?? null,
      started_at: params.status === 'processing' ? new Date().toISOString() : undefined,
      finished_at: params.status === 'processing' ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.jobId);
}

async function processSingleJob(job: SimulationJobRow) {
  const caseContext = await getCaseContext(job.case_id, job.owner_user_id);
  const llmConfig = await getUserLlmConfig(job.owner_user_id);
  const objective = job.payload?.objective ?? job.objective;

  if (job.mode === 'single_agent') {
    const output = await runSingleAgentSimulation({
      caseId: caseContext.id,
      objective,
      facts: caseContext.summary,
      forum: caseContext.court_name ?? null,
      jurisdiction: caseContext.jurisdiction ?? null,
      parsedDocumentTexts: caseContext.parsedDocumentTexts,
      voiceTranscript: caseContext.voice_transcript ?? null,
      ...(llmConfig ? { outputLanguage: llmConfig.outputLanguage } : {}),
      ...(llmConfig ? { llmConfig } : {}),
    });

    const supabase = createSupabaseAdminClient();
    const simulationId = crypto.randomUUID();
    await supabase.from('simulations').insert({
      id: simulationId,
      owner_user_id: job.owner_user_id,
      case_id: caseContext.id,
      mode: 'single_agent',
      headline:
        llmConfig?.outputLanguage === 'hi-IN'
          ? 'सिंगल-एजेंट आधारभूत रणनीति विश्लेषण'
          : 'Single-agent baseline analysis',
      confidence: output.confidence,
      strategy_json: output,
    });

    await insertAuditLog({
      caseId: caseContext.id,
      userId: job.owner_user_id,
      runType: 'single_agent',
      prompt: `Single-agent objective: ${objective}`,
      response: output.analysis,
      confidence: output.confidence,
    });

    return simulationId;
  }

  const engineName = job.payload?.engineName ?? 'legacy';
  const output =
    engineName === 'KAUTILYA_CERES'
      ? await runKautilyaCeresWarGame({
          caseId: caseContext.id,
          summary: caseContext.summary,
          objective,
          forum: caseContext.court_name ?? null,
          jurisdiction: caseContext.jurisdiction ?? null,
          parsedDocumentTexts: caseContext.parsedDocumentTexts,
          documents: caseContext.documents.map((document) => ({
            id: document.id,
            name: document.name,
            documentType: toDocumentType(document.documentType),
            text: document.text,
          })),
          voiceTranscript: caseContext.voice_transcript ?? null,
          depth: job.payload?.depth ?? job.depth ?? 7,
          strategyMode: job.payload?.strategyMode ?? 'robust_mode',
          computeMode: job.payload?.computeMode ?? 'standard',
          ...(llmConfig ? { outputLanguage: llmConfig.outputLanguage } : {}),
          ...(llmConfig ? { llmConfig } : {}),
        })
      : await runOrchestratedWarGame({
          caseId: caseContext.id,
          summary: caseContext.summary,
          objective,
          forum: caseContext.court_name ?? null,
          jurisdiction: caseContext.jurisdiction ?? null,
          parsedDocumentTexts: caseContext.parsedDocumentTexts,
          voiceTranscript: caseContext.voice_transcript ?? null,
          depth: job.payload?.depth ?? job.depth ?? 7,
          ...(llmConfig ? { outputLanguage: llmConfig.outputLanguage } : {}),
          ...(llmConfig ? { llmConfig } : {}),
        });

  const supabase = createSupabaseAdminClient();
  const simulationId = crypto.randomUUID();
  await supabase.from('simulations').insert({
    id: simulationId,
    owner_user_id: job.owner_user_id,
    case_id: caseContext.id,
    mode: 'multi_agent',
    headline: output.headline,
    confidence: output.confidence,
    win_probability: output.winProbability,
    strategy_json: output,
  });

  if (engineName === 'KAUTILYA_CERES') {
    await persistKautilyaStrategyRun({
      simulationId,
      ownerUserId: job.owner_user_id,
      caseId: caseContext.id,
      objective,
      output,
    });
  }

  await insertAuditLog({
    caseId: caseContext.id,
    userId: job.owner_user_id,
    runType: 'multi_agent',
    prompt: `${engineName} objective: ${objective}`,
    response: JSON.stringify(output.rankedPlan),
    confidence: output.confidence,
  });

  return simulationId;
}

export async function processSimulationQueue(params?: { limit?: number }) {
  const limit = Math.max(1, Math.min(10, params?.limit ?? 3));
  const supabase = createSupabaseAdminClient();
  const queuedRes = await supabase.rpc('claim_simulation_jobs', {
    job_limit: limit,
  });

  if (queuedRes.error) {
    throw new Error(`Failed to claim simulation queue jobs: ${queuedRes.error.message}`);
  }

  let processed = 0;
  let completed = 0;
  let failed = 0;
  const results: Array<{ jobId: string; status: 'completed' | 'failed'; simulationId?: string; error?: string }> = [];

  for (const row of queuedRes.data ?? []) {
    const job = row as SimulationJobRow;
    processed += 1;
    const attempts = job.attempts ?? 1;

    try {
      const simulationId = await processSingleJob(job);
      completed += 1;
      await markJobStatus({
        jobId: job.id,
        status: 'completed',
        attempts,
        resultSimulationId: simulationId,
      });
      results.push({ jobId: job.id, status: 'completed', simulationId });
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      await markJobStatus({
        jobId: job.id,
        status: 'failed',
        attempts,
        errorMessage: message.slice(0, 1000),
      });
      results.push({ jobId: job.id, status: 'failed', error: message });
    }
  }

  return {
    processed,
    completed,
    failed,
    results,
  };
}
