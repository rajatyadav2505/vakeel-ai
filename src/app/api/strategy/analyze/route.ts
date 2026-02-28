import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbReady } from '@/lib/db/init';
import { serializeStrategyAnalysis } from '@/lib/db/serializers';
import { cases, strategyAnalyses } from '@/lib/db/schema';
import { analyzeStrategy } from '@/lib/ai/strategy/analyzer';
import { badRequest, internalError } from '@/lib/api/responses';

export async function POST(request: NextRequest) {
  try {
    await ensureDbReady();
    const payload = (await request.json()) as Partial<{
      caseId: string;
      objective: string;
      caseBrief: string;
      riskTolerance: 'low' | 'medium' | 'high';
    }>;

    if (!payload.caseId?.trim()) {
      return badRequest('caseId is required');
    }

    const caseRow = await db.select().from(cases).where(eq(cases.id, payload.caseId)).limit(1);
    if (!caseRow[0]) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const analysis = await analyzeStrategy({
      caseData: caseRow[0],
      facts: payload.caseBrief?.trim() || caseRow[0].description || 'No additional facts provided.',
      objective: payload.objective?.trim() || 'Secure best litigation outcome for client',
      riskTolerance: payload.riskTolerance ?? 'medium',
    });

    const serialized = serializeStrategyAnalysis(analysis);

    await db.insert(strategyAnalyses).values({
      id: analysis.id,
      caseId: analysis.caseId,
      ...serialized,
      confidence: analysis.confidence,
      createdAt: new Date(analysis.createdAt),
    });

    return NextResponse.json(analysis, { status: 201 });
  } catch (error) {
    return internalError('Failed to analyze strategy', String(error));
  }
}
