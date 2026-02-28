import { and, asc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbReady } from '@/lib/db/init';
import { caseTimeline, cases } from '@/lib/db/schema';
import { badRequest, internalError } from '@/lib/api/responses';
import { generateId } from '@/lib/utils';
import type { EventType } from '@/types/case';

const EVENT_TYPES: EventType[] = [
  'filing',
  'hearing',
  'order',
  'adjournment',
  'evidence',
  'argument',
];

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDbReady();
    const { id } = await context.params;
    const rows = await db
      .select()
      .from(caseTimeline)
      .where(eq(caseTimeline.caseId, id))
      .orderBy(asc(caseTimeline.eventDate));
    return NextResponse.json(rows);
  } catch (error) {
    return internalError('Failed to fetch timeline', String(error));
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDbReady();
    const { id } = await context.params;

    const payload = (await request.json()) as Partial<{
      eventDate: string;
      eventType: EventType;
      title: string;
      description: string;
      outcome: string;
    }>;

    if (!payload.eventDate?.trim()) {
      return badRequest('eventDate is required');
    }
    if (!payload.title?.trim()) {
      return badRequest('title is required');
    }
    if (!payload.eventType || !EVENT_TYPES.includes(payload.eventType)) {
      return badRequest('eventType is invalid');
    }

    const caseExists = await db
      .select({ id: cases.id })
      .from(cases)
      .where(eq(cases.id, id))
      .limit(1);

    if (!caseExists[0]) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const newItem = {
      id: generateId(),
      caseId: id,
      eventDate: payload.eventDate,
      eventType: payload.eventType,
      title: payload.title.trim(),
      description: payload.description?.trim() || null,
      outcome: payload.outcome?.trim() || null,
    };

    await db.insert(caseTimeline).values(newItem);
    await db
      .update(cases)
      .set({ updatedAt: new Date() })
      .where(and(eq(cases.id, id)));

    return NextResponse.json(newItem, { status: 201 });
  } catch (error) {
    return internalError('Failed to add timeline event', String(error));
  }
}
