'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { petitionRequestSchema } from '@nyaya/shared';
import { generateFormattedPetition } from '@nyaya/agents';
import { requireAppUser } from '@/lib/auth';
import { resolveRuntimeLlmConfig } from '@/lib/llm-settings';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { logAiAudit } from '@/lib/audit';
import { sanitizePlainText } from '@/lib/utils';

async function getCaseContext(caseId: string, ownerUserId: string) {
  const supabase = createSupabaseServerClient();
  const [caseRes, docsRes] = await Promise.all([
    supabase
      .from('cases')
      .select('id,summary,court_name,jurisdiction,voice_transcript')
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
  if (!caseRes.data) throw new Error('Case not found');
  return {
    ...caseRes.data,
    parsedDocumentTexts: (docsRes.data ?? [])
      .map((item) => item.parsed_text)
      .filter((text): text is string => typeof text === 'string' && text.trim().length >= 20),
  };
}

async function getUserLlmConfig(userId: string) {
  const supabase = createSupabaseServerClient();
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

export async function generatePetitionAction(formData: FormData) {
  const user = await requireAppUser();
  await enforceRateLimit(`petition:${user.userId}`, 20);

  const payload = petitionRequestSchema.parse({
    caseId: String(formData.get('caseId') ?? ''),
    petitionType: String(formData.get('petitionType') ?? ''),
    courtTemplate: String(formData.get('courtTemplate') ?? ''),
    facts: sanitizePlainText(String(formData.get('facts') ?? '')),
    legalGrounds: sanitizePlainText(String(formData.get('legalGrounds') ?? '')),
    reliefSought: sanitizePlainText(String(formData.get('reliefSought') ?? '')),
    lawyerVerified: String(formData.get('lawyerVerified') ?? '') === 'on',
  });

  const caseContext = await getCaseContext(payload.caseId, user.userId);
  const llmConfig = await getUserLlmConfig(user.userId);
  const result = await generateFormattedPetition({
    ...payload,
    forum: caseContext.court_name ?? null,
    jurisdiction: caseContext.jurisdiction ?? null,
    parsedDocumentTexts: caseContext.parsedDocumentTexts,
    voiceTranscript: caseContext.voice_transcript ?? null,
    ...(llmConfig ? { outputLanguage: llmConfig.outputLanguage } : {}),
    ...(llmConfig ? { llmConfig } : {}),
  });

  const supabase = createSupabaseServerClient();
  const petitionId = crypto.randomUUID();
  const petitionInsert = {
    id: petitionId,
    owner_user_id: user.userId,
    case_id: payload.caseId,
    petition_type: payload.petitionType,
    court_template: payload.courtTemplate,
    body: result.body,
    confidence: result.confidence,
    citations_json: {
      citations: result.citations,
      legalResearchPacket: result.legalResearchPacket,
      statutoryAuthorities: result.statutoryAuthorities,
      leadingPrecedents: result.leadingPrecedents,
      latestPrecedents: result.latestPrecedents,
      groundedLegalClaims: result.groundedLegalClaims,
      unverifiedClaims: result.unverifiedClaims,
      legalGroundingStatus: result.legalGroundingStatus,
    },
    lawyer_verified: payload.lawyerVerified,
    current_version: 1,
    review_status: payload.lawyerVerified ? 'approved' : 'draft',
    review_notes: null,
    last_reviewed_by: payload.lawyerVerified ? user.userId : null,
    last_reviewed_at: payload.lawyerVerified ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };

  let insertResult = await supabase.from('petitions').insert(petitionInsert);
  if (insertResult.error) {
    // Backward compatibility when review columns are not present yet.
    insertResult = await supabase.from('petitions').insert({
      id: petitionId,
      owner_user_id: user.userId,
      case_id: payload.caseId,
      petition_type: payload.petitionType,
      court_template: payload.courtTemplate,
      body: result.body,
      confidence: result.confidence,
      citations_json: petitionInsert.citations_json,
      lawyer_verified: payload.lawyerVerified,
    });
  }

  if (insertResult.error) throw new Error('Failed to save petition. Please try again.');

  const versionInsert = await supabase.from('petition_versions').insert({
    petition_id: petitionId,
    owner_user_id: user.userId,
    version: 1,
    body: result.body,
    change_summary: 'Initial AI-generated draft',
    review_action: payload.lawyerVerified ? 'approved' : 'generated',
    created_by: user.userId,
  });
  if (versionInsert.error) {
    console.warn('[petitions] failed to persist initial petition version:', versionInsert.error.message);
  }

  await logAiAudit({
    caseId: payload.caseId,
    userId: user.userId,
    runType: 'petition',
    prompt: `${payload.petitionType} for ${payload.courtTemplate}`,
    response: result.body.slice(0, 1500),
    confidence: result.confidence,
  });

  revalidatePath('/');
  revalidatePath('/petitions');
  redirect('/petitions');
}
