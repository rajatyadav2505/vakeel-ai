import { desc } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbReady } from '@/lib/db/init';
import { petitions } from '@/lib/db/schema';
import { deserializePetitionRow } from '@/lib/db/serializers';
import { internalError } from '@/lib/api/responses';

export async function GET() {
  try {
    await ensureDbReady();
    const rows = await db.select().from(petitions).orderBy(desc(petitions.updatedAt));
    return NextResponse.json(rows.map((row) => deserializePetitionRow(row)));
  } catch (error) {
    return internalError('Failed to fetch petitions', String(error));
  }
}
