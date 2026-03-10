import { NextRequest, NextResponse } from 'next/server';
import { requireAppUser } from '@/lib/auth';
import { createSupabaseUserClient } from '@/lib/supabase/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { sanitizePlainText } from '@/lib/utils';

function parsePositiveInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function normalizePhone(value: string | null) {
  if (!value) return '';
  return sanitizePlainText(value).replace(/[^\d+]/g, '');
}

type MessageRow = {
  id: string;
  sender_phone: string;
  contact_phone?: string | null;
  body: string;
  message_id: string;
  media_url?: string | null;
  created_at: string;
  direction?: string | null;
  delivery_status?: string | null;
  raw_payload?: {
    direction?: string;
    ownerUserId?: string;
  } | null;
};

function toMessageRows(data: unknown): MessageRow[] {
  return Array.isArray(data) ? (data as MessageRow[]) : [];
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAppUser();
    await enforceRateLimit(`wa-messages:${user.userId}`, 240);

    const params = request.nextUrl.searchParams;
    const page = parsePositiveInt(params.get('page'), 1, 1, 500);
    const pageSize = parsePositiveInt(params.get('pageSize'), 25, 5, 100);
    const phone = normalizePhone(params.get('phone'));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const supabase = createSupabaseUserClient(user.supabaseAccessToken);

    let messagesQuery = supabase
      .from('whatsapp_messages')
      .select(
        'id, sender_phone, contact_phone, body, message_id, media_url, created_at, direction, delivery_status, raw_payload',
        { count: 'exact' },
      )
      .eq('owner_user_id', user.userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (phone) {
      messagesQuery = messagesQuery.eq('contact_phone', phone);
    }

    let messagesResult = await messagesQuery;

    if (messagesResult.error) {
      // Backward compatibility when newer message columns do not exist.
      let legacyQuery = supabase
        .from('whatsapp_messages')
        .select('id, sender_phone, body, message_id, media_url, created_at, raw_payload', {
          count: 'exact',
        })
        .contains('raw_payload', { ownerUserId: user.userId })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (phone) legacyQuery = legacyQuery.eq('sender_phone', phone);
      messagesResult = (await legacyQuery) as typeof messagesResult;
    }

    const messageRows = toMessageRows(messagesResult.data);

    const items = messageRows.map((row) => ({
      id: row.id,
      body: row.body,
      messageId: row.message_id,
      mediaUrl: row.media_url ?? null,
      contactPhone: row.contact_phone ?? row.sender_phone,
      direction:
        row.direction === 'outbound' || row.raw_payload?.direction === 'outbound'
          ? 'outbound'
          : 'inbound',
      deliveryStatus: row.delivery_status ?? 'received',
      createdAt: row.created_at,
    }));

    let conversationSource = await supabase
      .from('whatsapp_messages')
      .select('sender_phone, contact_phone, body, created_at, direction, raw_payload')
      .eq('owner_user_id', user.userId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (conversationSource.error) {
      conversationSource = (await supabase
        .from('whatsapp_messages')
        .select('sender_phone, body, created_at, raw_payload')
        .contains('raw_payload', { ownerUserId: user.userId })
        .order('created_at', { ascending: false })
        .limit(200)) as typeof conversationSource;
    }

    const conversations: Array<{ phone: string; lastMessage: string; updatedAt: string }> = [];
    const seen = new Set<string>();
    for (const row of toMessageRows(conversationSource.data)) {
      const contact = row.contact_phone ?? row.sender_phone;
      if (!contact || seen.has(contact)) continue;
      conversations.push({
        phone: contact,
        lastMessage: row.body,
        updatedAt: row.created_at,
      });
      seen.add(contact);
      if (conversations.length >= 30) break;
    }

    const total = messagesResult.count ?? 0;

    return NextResponse.json({
      ok: true,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items,
      conversations,
      realtimeChannel: `whatsapp:${user.userId}`,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
