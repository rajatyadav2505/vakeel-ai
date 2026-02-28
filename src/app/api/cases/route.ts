import { desc } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbReady } from '@/lib/db/init';
import { cases } from '@/lib/db/schema';
import { badRequest, internalError } from '@/lib/api/responses';
import { generateId } from '@/lib/utils';
import type { CaseType } from '@/types/case';

const ALLOWED_CASE_TYPES: CaseType[] = [
  'civil',
  'criminal',
  'constitutional',
  'family',
  'labor',
  'consumer',
  'tax',
];

export async function GET() {
  try {
    await ensureDbReady();
    const rows = await db.select().from(cases).orderBy(desc(cases.updatedAt));
    return NextResponse.json(rows);
  } catch (error) {
    return internalError('Failed to fetch cases', String(error));
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDbReady();
    const body = (await request.json()) as Partial<{
      title: string;
      caseNumber: string;
      caseType: CaseType;
      court: string;
      judge: string;
      description: string;
      filingDate: string;
      nextHearing: string;
      opponentName: string;
      opponentAdvocate: string;
      clientName: string;
      notes: string;
    }>;

    if (!body.title?.trim()) {
      return badRequest('title is required');
    }

    if (!body.caseType || !ALLOWED_CASE_TYPES.includes(body.caseType)) {
      return badRequest('caseType is required and must be valid');
    }

    const now = new Date();
    const newRow = {
      id: generateId(),
      title: body.title.trim(),
      caseNumber: body.caseNumber?.trim() || null,
      caseType: body.caseType,
      court: body.court?.trim() || null,
      judge: body.judge?.trim() || null,
      status: 'active' as const,
      description: body.description?.trim() || null,
      filingDate: body.filingDate?.trim() || null,
      nextHearing: body.nextHearing?.trim() || null,
      opponentName: body.opponentName?.trim() || null,
      opponentAdvocate: body.opponentAdvocate?.trim() || null,
      clientName: body.clientName?.trim() || null,
      notes: body.notes?.trim() || null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(cases).values(newRow);
    return NextResponse.json(newRow, { status: 201 });
  } catch (error) {
    return internalError('Failed to create case', String(error));
  }
}
