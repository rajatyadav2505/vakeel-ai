import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildCaseEvidenceGraph } from '@nyaya/agents';
import { requireAppUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/rate-limit';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAppUser();
    await enforceRateLimit(`case-evidence-get:${user.userId}`, 180);
    const params = paramsSchema.parse(await props.params);
    const supabase = createSupabaseServerClient();

    const [caseRes, docsRes] = await Promise.all([
      supabase
        .from('cases')
        .select('id, evidence_graph_json, evidence_extracted_at, case_sensitivity')
        .eq('id', params.id)
        .eq('owner_user_id', user.userId)
        .single(),
      supabase
        .from('case_documents')
        .select('id, file_name, document_type, parser_status, size_bytes, is_privileged, created_at')
        .eq('case_id', params.id)
        .eq('owner_user_id', user.userId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    if (caseRes.error || !caseRes.data) {
      return NextResponse.json({ error: 'Case not found.' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      caseId: params.id,
      evidenceGraph: caseRes.data.evidence_graph_json ?? null,
      evidenceExtractedAt: caseRes.data.evidence_extracted_at ?? null,
      caseSensitivity: caseRes.data.case_sensitivity ?? 'standard',
      documents: docsRes.data ?? [],
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAppUser();
    await enforceRateLimit(`case-evidence-rebuild:${user.userId}`, 40);
    const params = paramsSchema.parse(await props.params);
    const supabase = createSupabaseServerClient();

    const caseRes = await supabase
      .from('cases')
      .select('id, summary, voice_transcript')
      .eq('id', params.id)
      .eq('owner_user_id', user.userId)
      .single();
    if (caseRes.error || !caseRes.data) {
      return NextResponse.json({ error: 'Case not found.' }, { status: 404 });
    }

    const docsRes = await supabase
      .from('case_documents')
      .select('id, file_name, document_type, parsed_text')
      .eq('case_id', params.id)
      .eq('owner_user_id', user.userId)
      .limit(200);

    const graph = await buildCaseEvidenceGraph({
      caseId: params.id,
      summary: caseRes.data.summary,
      ...(caseRes.data.voice_transcript ? { voiceTranscript: caseRes.data.voice_transcript } : {}),
      evidenceSources: (docsRes.data ?? []).map((row) => ({
        id: row.id,
        name: row.file_name,
        documentType: row.document_type,
        text: row.parsed_text,
      })),
    });

    const update = await supabase
      .from('cases')
      .update({
        evidence_graph_json: graph,
        evidence_extracted_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('owner_user_id', user.userId);
    if (update.error) {
      return NextResponse.json({ error: update.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, evidenceGraph: graph });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}

