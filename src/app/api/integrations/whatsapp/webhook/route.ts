import { desc, eq, sql } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbReady } from '@/lib/db/init';
import { caseTimeline, whatsappMessages, whatsappThreads } from '@/lib/db/schema';
import { internalError } from '@/lib/api/responses';
import { generateId } from '@/lib/utils';

function normalizePhone(input: string): string {
  return input.replace(/^whatsapp:/, '').replace(/[^\d+]/g, '');
}

export async function POST(request: NextRequest) {
  try {
    await ensureDbReady();
    const form = await request.formData();

    const from = normalizePhone(String(form.get('From') ?? ''));
    const body = String(form.get('Body') ?? '').trim();
    const messageSid = String(form.get('MessageSid') ?? '');

    if (!from || !body) {
      return new NextResponse('<Response></Response>', {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    const thread = await db
      .select()
      .from(whatsappThreads)
      .where(sql`${whatsappThreads.clientPhone} = ${from}`)
      .orderBy(desc(whatsappThreads.updatedAt))
      .limit(1);

    if (thread[0]) {
      await db.insert(whatsappMessages).values({
        id: generateId(),
        threadId: thread[0].id,
        direction: 'inbound',
        body,
        mediaUrl: null,
        providerMessageId: messageSid || null,
        status: 'received',
        timestamp: new Date(),
      });

      await db
        .update(whatsappThreads)
        .set({ updatedAt: new Date() })
        .where(eq(whatsappThreads.id, thread[0].id));

      await db.insert(caseTimeline).values({
        id: generateId(),
        caseId: thread[0].caseId,
        eventDate: new Date().toISOString().slice(0, 10),
        eventType: 'argument',
        title: 'Client WhatsApp update received',
        description: body,
        outcome: null,
      });
    }

    return new NextResponse('<Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch (error) {
    return internalError('Failed to process WhatsApp webhook', String(error));
  }
}
