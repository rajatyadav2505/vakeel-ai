import { desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbReady } from '@/lib/db/init';
import { deserializeStrategyRow } from '@/lib/db/serializers';
import { strategyAnalyses } from '@/lib/db/schema';
import { internalError } from '@/lib/api/responses';

export async function GET(
  _: NextRequest,
  context: { params: Promise<{ caseId: string }> }
) {
  try {
    await ensureDbReady();
    const { caseId } = await context.params;
    const rows = await db
      .select()
      .from(strategyAnalyses)
      .where(eq(strategyAnalyses.caseId, caseId))
      .orderBy(desc(strategyAnalyses.createdAt))
      .limit(1);

    if (!rows[0]) {
      return NextResponse.json({ error: 'No strategy found for this case' }, { status: 404 });
    }

    return NextResponse.json(deserializeStrategyRow(rows[0]));
  } catch (error) {
    return internalError('Failed to fetch strategy', String(error));
  }
}
