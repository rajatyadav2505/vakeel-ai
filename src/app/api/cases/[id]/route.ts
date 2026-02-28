import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbReady } from '@/lib/db/init';
import { cases } from '@/lib/db/schema';
import { badRequest, internalError } from '@/lib/api/responses';
import type { CaseStatus } from '@/types/case';

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDbReady();
    const { id } = await context.params;
    const row = await db.select().from(cases).where(eq(cases.id, id)).limit(1);

    if (!row[0]) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    return NextResponse.json(row[0]);
  } catch (error) {
    return internalError('Failed to fetch case', String(error));
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDbReady();
    const { id } = await context.params;
    const body = (await request.json()) as Partial<{
      title: string;
      caseNumber: string | null;
      caseType: string;
      court: string | null;
      judge: string | null;
      status: CaseStatus;
      description: string | null;
      filingDate: string | null;
      nextHearing: string | null;
      opponentName: string | null;
      opponentAdvocate: string | null;
      clientName: string | null;
      notes: string | null;
    }>;

    if (body.title !== undefined && !String(body.title).trim()) {
      return badRequest('title cannot be empty');
    }

    const updatePayload = {
      ...(body.title !== undefined ? { title: String(body.title).trim() } : {}),
      ...(body.caseNumber !== undefined ? { caseNumber: body.caseNumber?.trim() || null } : {}),
      ...(body.caseType !== undefined ? { caseType: body.caseType as typeof cases.$inferInsert.caseType } : {}),
      ...(body.court !== undefined ? { court: body.court?.trim() || null } : {}),
      ...(body.judge !== undefined ? { judge: body.judge?.trim() || null } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
      ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
      ...(body.filingDate !== undefined ? { filingDate: body.filingDate?.trim() || null } : {}),
      ...(body.nextHearing !== undefined ? { nextHearing: body.nextHearing?.trim() || null } : {}),
      ...(body.opponentName !== undefined ? { opponentName: body.opponentName?.trim() || null } : {}),
      ...(body.opponentAdvocate !== undefined
        ? { opponentAdvocate: body.opponentAdvocate?.trim() || null }
        : {}),
      ...(body.clientName !== undefined ? { clientName: body.clientName?.trim() || null } : {}),
      ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
      updatedAt: new Date(),
    };

    await db.update(cases).set(updatePayload).where(eq(cases.id, id));
    const updated = await db.select().from(cases).where(eq(cases.id, id)).limit(1);

    if (!updated[0]) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    return NextResponse.json(updated[0]);
  } catch (error) {
    return internalError('Failed to update case', String(error));
  }
}

export async function DELETE(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDbReady();
    const { id } = await context.params;
    await db.delete(cases).where(eq(cases.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return internalError('Failed to delete case', String(error));
  }
}
