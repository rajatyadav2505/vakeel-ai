import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbReady } from '@/lib/db/init';
import { whatsappMessages, whatsappThreads } from '@/lib/db/schema';
import { badRequest, internalError } from '@/lib/api/responses';
import { generateId } from '@/lib/utils';
import { sendWhatsappMessage } from '@/lib/whatsapp/twilio';

function normalizePhone(input: string): string {
  return input.replace(/[^\d+]/g, '');
}

export async function POST(request: NextRequest) {
  try {
    await ensureDbReady();
    const payload = (await request.json()) as Partial<{
      threadId: string;
      caseId: string;
      advocatePhone: string;
      clientPhone: string;
      label: string;
      message: string;
    }>;

    if (!payload.message?.trim()) {
      return badRequest('message is required');
    }

    let threadId = payload.threadId?.trim();
    if (!threadId) {
      if (!payload.caseId?.trim() || !payload.advocatePhone?.trim() || !payload.clientPhone?.trim()) {
        return badRequest('caseId, advocatePhone, and clientPhone are required when creating a new thread');
      }

      threadId = generateId();
      await db.insert(whatsappThreads).values({
        id: threadId,
        caseId: payload.caseId.trim(),
        advocatePhone: normalizePhone(payload.advocatePhone),
        clientPhone: normalizePhone(payload.clientPhone),
        label: payload.label?.trim() || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const thread = await db
      .select()
      .from(whatsappThreads)
      .where(eq(whatsappThreads.id, threadId))
      .limit(1);

    if (!thread[0]) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    const result = await sendWhatsappMessage({
      to: thread[0].clientPhone,
      body: payload.message.trim(),
    });

    const messageRow = {
      id: generateId(),
      threadId: thread[0].id,
      direction: 'outbound' as const,
      body: payload.message.trim(),
      mediaUrl: null,
      providerMessageId: result.sid,
      status: result.status === 'failed' ? ('failed' as const) : ('sent' as const),
      timestamp: new Date(),
    };

    await db.insert(whatsappMessages).values(messageRow);
    await db
      .update(whatsappThreads)
      .set({ updatedAt: new Date() })
      .where(eq(whatsappThreads.id, thread[0].id));

    return NextResponse.json({ threadId: thread[0].id, message: messageRow }, { status: 201 });
  } catch (error) {
    return internalError('Failed to send WhatsApp message', String(error));
  }
}
