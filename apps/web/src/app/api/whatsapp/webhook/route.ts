import { NextRequest, NextResponse } from 'next/server';
import { whatsappWebhookSchema } from '@nyaya/shared';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function normalizePhone(value: string) {
  return value.replace(/^whatsapp:/i, '').replace(/[^\d+]/g, '');
}

function extractMessageBody(payload: Record<string, unknown>) {
  const candidates = [
    payload.body,
    (payload.message as { text?: string } | undefined)?.text,
    (payload.message as { payload?: { text?: string } } | undefined)?.payload?.text,
    (payload.interactive as { button_reply?: { title?: string } } | undefined)?.button_reply?.title,
    (payload.interactive as { button_reply?: { id?: string } } | undefined)?.button_reply?.id,
    (payload.button as { text?: string } | undefined)?.text,
    (payload.button as { payload?: string } | undefined)?.payload,
    (payload.postback as { text?: string } | undefined)?.text,
    (payload.postback as { payload?: string } | undefined)?.payload,
  ];

  for (const item of candidates) {
    if (typeof item === 'string' && item.trim().length > 0) {
      return item.trim();
    }
  }

  return '';
}

export async function POST(request: NextRequest) {
  try {
    const json = (await request.json()) as Record<string, unknown>;
    const payload = whatsappWebhookSchema.parse({
      from: json.from || json.phone,
      body: extractMessageBody(json),
      messageId: json.messageId || json.id || crypto.randomUUID(),
      mediaUrl: json.mediaUrl,
    });

    const supabase = createSupabaseServerClient();
    const from = normalizePhone(payload.from);

    let latestOwnerLookup = await supabase
      .from('whatsapp_messages')
      .select('owner_user_id, raw_payload')
      .eq('contact_phone', from)
      .order('created_at', { ascending: false })
      .limit(1);

    if (latestOwnerLookup.error) {
      latestOwnerLookup = await supabase
        .from('whatsapp_messages')
        .select('owner_user_id, raw_payload')
        .eq('sender_phone', from)
        .order('created_at', { ascending: false })
        .limit(1);
    }

    let ownerUserId: string | null = null;
    const latest = latestOwnerLookup.data?.[0] as
      | {
          owner_user_id?: string | null;
          raw_payload?: { ownerUserId?: string } | null;
        }
      | undefined;

    ownerUserId = latest?.owner_user_id ?? latest?.raw_payload?.ownerUserId ?? null;

    const enhancedInsert = await supabase.from('whatsapp_messages').insert({
      id: crypto.randomUUID(),
      owner_user_id: ownerUserId,
      sender_phone: from,
      contact_phone: from,
      body: payload.body,
      message_id: payload.messageId,
      media_url: payload.mediaUrl ?? null,
      direction: 'inbound',
      delivery_status: 'received',
      raw_payload: {
        ...json,
        direction: 'inbound',
        ownerUserId,
      },
    });

    if (enhancedInsert.error) {
      // Backward compatibility when migration columns are not present yet.
      await supabase.from('whatsapp_messages').insert({
        id: crypto.randomUUID(),
        sender_phone: from,
        body: payload.body,
        message_id: payload.messageId,
        media_url: payload.mediaUrl ?? null,
        raw_payload: {
          ...json,
          direction: 'inbound',
          ownerUserId,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
