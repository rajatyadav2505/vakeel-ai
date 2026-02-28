import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbReady } from '@/lib/db/init';
import {
  deserializePetitionRow,
  parseCitations,
  parsePetitionContent,
  serializeCitations,
  serializePetitionContent,
} from '@/lib/db/serializers';
import { petitions } from '@/lib/db/schema';
import { internalError } from '@/lib/api/responses';
import type { PetitionStatus } from '@/types/petition';

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDbReady();
    const { id } = await context.params;
    const row = await db.select().from(petitions).where(eq(petitions.id, id)).limit(1);
    if (!row[0]) {
      return NextResponse.json({ error: 'Petition not found' }, { status: 404 });
    }

    return NextResponse.json(deserializePetitionRow(row[0]));
  } catch (error) {
    return internalError('Failed to fetch petition', String(error));
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDbReady();
    const { id } = await context.params;
    const payload = (await request.json()) as Partial<{
      title: string;
      status: PetitionStatus;
      content: string;
      citations: string;
    }>;

    const existing = await db.select().from(petitions).where(eq(petitions.id, id)).limit(1);
    const row = existing[0];
    if (!row) {
      return NextResponse.json({ error: 'Petition not found' }, { status: 404 });
    }

    const content = payload.content
      ? { ...parsePetitionContent(row.content), fullText: payload.content }
      : parsePetitionContent(row.content);

    await db
      .update(petitions)
      .set({
        title: payload.title?.trim() ?? row.title,
        status: payload.status ?? row.status,
        content: serializePetitionContent(content),
        citations: payload.citations
          ? serializeCitations(parseCitations(payload.citations))
          : row.citations,
        updatedAt: new Date(),
      })
      .where(eq(petitions.id, id));

    const updated = await db.select().from(petitions).where(eq(petitions.id, id)).limit(1);
    return NextResponse.json(deserializePetitionRow(updated[0]));
  } catch (error) {
    return internalError('Failed to update petition', String(error));
  }
}
