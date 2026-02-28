import { asc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbReady } from '@/lib/db/init';
import { hearings } from '@/lib/db/schema';
import { badRequest, internalError } from '@/lib/api/responses';
import { generateId } from '@/lib/utils';
import type { HearingStatus } from '@/types/case';

const HEARING_STATUSES: HearingStatus[] = ['scheduled', 'completed', 'adjourned'];

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDbReady();
    const { id } = await context.params;
    const rows = await db
      .select()
      .from(hearings)
      .where(eq(hearings.caseId, id))
      .orderBy(asc(hearings.date));
    return NextResponse.json(rows);
  } catch (error) {
    return internalError('Failed to fetch hearings', String(error));
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDbReady();
    const { id } = await context.params;
    const payload = (await request.json()) as Partial<{
      date: string;
      court: string;
      judge: string;
      purpose: string;
      status: HearingStatus;
      notes: string;
      outcome: string;
    }>;

    if (!payload.date?.trim()) {
      return badRequest('date is required');
    }
    if (payload.status && !HEARING_STATUSES.includes(payload.status)) {
      return badRequest('status is invalid');
    }

    const newItem = {
      id: generateId(),
      caseId: id,
      date: payload.date,
      court: payload.court?.trim() || null,
      judge: payload.judge?.trim() || null,
      purpose: payload.purpose?.trim() || null,
      status: payload.status ?? ('scheduled' as const),
      notes: payload.notes?.trim() || null,
      outcome: payload.outcome?.trim() || null,
    };

    await db.insert(hearings).values(newItem);
    return NextResponse.json(newItem, { status: 201 });
  } catch (error) {
    return internalError('Failed to add hearing', String(error));
  }
}
