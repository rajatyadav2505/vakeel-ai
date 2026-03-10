import { createSupabaseUserClient } from '@/lib/supabase/server';

export async function logAiAudit(params: {
  accessToken: string;
  caseId: string;
  userId: string;
  runType: 'single_agent' | 'multi_agent' | 'petition';
  prompt: string;
  response: string;
  confidence: number;
}) {
  const supabase = createSupabaseUserClient(params.accessToken);
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
