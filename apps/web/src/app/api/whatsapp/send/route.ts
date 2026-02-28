import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runSingleAgentSimulation } from '@nyaya/agents';
import { sendWhatsAppText } from '@/lib/whatsapp';
import { sanitizePlainText } from '@/lib/utils';
import { enforceRateLimit } from '@/lib/rate-limit';
import { requireAppUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const schema = z.object({
  to: z.string().min(8),
  text: z.string().min(1).max(2400),
  caseId: z.string().uuid().optional(),
  legalQuery: z.string().min(5).max(1200).optional(),
  groundedLegalReply: z.boolean().optional(),
});

function deriveMessageId(response: unknown) {
  if (!response || typeof response !== 'object') return crypto.randomUUID();
  const data = response as {
    messageId?: string;
    message_id?: string;
    data?: { messageId?: string; message_id?: string };
    messages?: Array<{ id?: string }>;
  };
  return (
    data.messageId ||
    data.message_id ||
    data.data?.messageId ||
    data.data?.message_id ||
    data.messages?.[0]?.id ||
    crypto.randomUUID()
  );
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAppUser();
    const payload = schema.parse(await request.json());
    await enforceRateLimit(`wa-send:${user.userId}`, 40);

    const to = sanitizePlainText(payload.to);
    let text = sanitizePlainText(payload.text);

    const shouldGroundReply = Boolean(payload.groundedLegalReply || payload.legalQuery);
    if (shouldGroundReply) {
      if (!payload.caseId) {
        return NextResponse.json(
          { error: 'caseId is required when groundedLegalReply is enabled.' },
          { status: 400 }
        );
      }

      const supabase = createSupabaseServerClient();
      const [caseRes, docsRes, settingsRes] = await Promise.all([
        supabase
          .from('cases')
          .select('id,summary,court_name,jurisdiction,voice_transcript')
          .eq('id', payload.caseId)
          .eq('owner_user_id', user.userId)
          .single(),
        supabase
          .from('case_documents')
          .select('parsed_text')
          .eq('case_id', payload.caseId)
          .eq('owner_user_id', user.userId)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('user_settings')
          .select('llm_provider,llm_model,llm_api_key,llm_base_url,free_tier_only')
          .eq('owner_user_id', user.userId)
          .maybeSingle(),
      ]);

      if (!caseRes.data) {
        return NextResponse.json({ error: 'Case not found for grounded WhatsApp reply.' }, { status: 404 });
      }

      const llmConfig = settingsRes.data
        ? {
            provider: settingsRes.data.llm_provider ?? 'sarvam',
            model: settingsRes.data.llm_model ?? 'sarvam-m',
            apiKey: settingsRes.data.llm_api_key ?? undefined,
            baseUrl: settingsRes.data.llm_base_url ?? undefined,
            freeTierOnly: settingsRes.data.free_tier_only ?? true,
          }
        : undefined;

      const simulation = await runSingleAgentSimulation({
        caseId: caseRes.data.id,
        objective: sanitizePlainText(payload.legalQuery ?? payload.text),
        facts: caseRes.data.summary,
        forum: caseRes.data.court_name ?? null,
        jurisdiction: caseRes.data.jurisdiction ?? null,
        voiceTranscript: caseRes.data.voice_transcript ?? null,
        parsedDocumentTexts: (docsRes.data ?? [])
          .map((item) => item.parsed_text)
          .filter((value): value is string => typeof value === 'string' && value.trim().length >= 20),
        ...(llmConfig ? { llmConfig } : {}),
      });

      const packet = simulation.legalResearchPacket;
      const topStatutes = packet?.statutoryAuthorities.slice(0, 2) ?? [];
      const topPrecedents = packet?.leadingPrecedents.slice(0, 2) ?? [];
      const unresolved = packet?.unresolvedIssues.slice(0, 2) ?? [];

      text = [
        simulation.analysis,
        '',
        'Statutory support:',
        topStatutes.length
          ? topStatutes.map((item) => `- ${item.title}`).join('\n')
          : '- No verified Indian statutory authority found yet.',
        '',
        'Precedent support:',
        topPrecedents.length
          ? topPrecedents.map((item) => `- ${item.caseName} (${item.court}, ${item.date})`).join('\n')
          : '- No verified Indian precedent found yet.',
        '',
        `Latest precedents checked at: ${packet?.precedentsCheckedAt ?? 'unknown'}`,
        unresolved.length
          ? `Needs more facts: ${unresolved.join(', ')}`
          : 'All identified issues have at least one authority.',
      ].join('\n');

      if (text.length > 2300) {
        text = `${text.slice(0, 2290)}...`;
      }
    }

    const response = await sendWhatsAppText({
      to,
      text,
    });

    const messageId = deriveMessageId(response);
    const supabase = createSupabaseServerClient();
    const enhancedInsert = await supabase.from('whatsapp_messages').insert({
      id: crypto.randomUUID(),
      owner_user_id: user.userId,
      sender_phone: to,
      contact_phone: to,
      body: text,
      message_id: messageId,
      direction: 'outbound',
      delivery_status: 'queued',
      raw_payload: {
        direction: 'outbound',
        ownerUserId: user.userId,
        provider: 'gupshup',
        providerResponse: response,
      },
    });

    if (enhancedInsert.error) {
      // Backward compatibility when migration columns are not present yet.
      await supabase.from('whatsapp_messages').insert({
        id: crypto.randomUUID(),
        sender_phone: to,
        body: text,
        message_id: messageId,
        raw_payload: {
          direction: 'outbound',
          ownerUserId: user.userId,
          provider: 'gupshup',
          providerResponse: response,
        },
      });
    }

    return NextResponse.json({ ok: true, response, messageId });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
