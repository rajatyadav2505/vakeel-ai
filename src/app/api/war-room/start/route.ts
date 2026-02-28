import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbReady } from '@/lib/db/init';
import { serializeStrategyAnalysis } from '@/lib/db/serializers';
import { cases, strategyAnalyses, warRoomMessages, warRoomSessions } from '@/lib/db/schema';
import { runWarGameSimulation } from '@/lib/ai/war-room/simulator';
import { badRequest, internalError } from '@/lib/api/responses';
import { DEFAULT_WAR_ROOM_CONFIG, type WarRoomConfig } from '@/types/agent';
import { generateId } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    await ensureDbReady();
    const payload = (await request.json()) as Partial<{
      caseId: string;
      objective: string;
      caseBrief: string;
      sessionName: string;
      config: Partial<WarRoomConfig>;
    }>;

    if (!payload.caseId?.trim()) {
      return badRequest('caseId is required');
    }

    const caseRow = await db.select().from(cases).where(eq(cases.id, payload.caseId)).limit(1);
    if (!caseRow[0]) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    const config: WarRoomConfig = {
      ...DEFAULT_WAR_ROOM_CONFIG,
      ...payload.config,
      focusAreas: payload.config?.focusAreas ?? DEFAULT_WAR_ROOM_CONFIG.focusAreas,
      activeClusters: payload.config?.activeClusters ?? DEFAULT_WAR_ROOM_CONFIG.activeClusters,
    };

    const result = await runWarGameSimulation({
      caseData: caseRow[0],
      objective: payload.objective?.trim() || 'Stay ahead of the opponent by two procedural steps',
      caseBrief: payload.caseBrief?.trim() || caseRow[0].description || 'No detailed brief provided.',
      config,
    });

    const sessionId = generateId();
    await db.insert(warRoomSessions).values({
      id: sessionId,
      caseId: caseRow[0].id,
      sessionName: payload.sessionName?.trim() || result.sessionName,
      status: 'completed',
      config: JSON.stringify(config),
      summary: result.summary,
      startedAt: new Date(),
      completedAt: new Date(),
    });

    await db.insert(warRoomMessages).values(
      result.messages.map((message) => ({
        id: message.id,
        sessionId,
        agentName: message.agentName,
        agentRole: message.agentRole,
        phase: message.phase,
        content: message.content,
        messageType: message.messageType,
        timestamp: new Date(message.timestamp),
      }))
    );

    const serializedStrategy = serializeStrategyAnalysis(result.strategy);
    await db.insert(strategyAnalyses).values({
      id: result.strategy.id,
      caseId: result.strategy.caseId,
      ...serializedStrategy,
      confidence: result.strategy.confidence,
      createdAt: new Date(result.strategy.createdAt),
    });

    return NextResponse.json(
      {
        sessionId,
        sessionName: payload.sessionName?.trim() || result.sessionName,
        summary: result.summary,
        strategy: result.strategy,
        messages: result.messages,
      },
      { status: 201 }
    );
  } catch (error) {
    return internalError('Failed to start war-room simulation', String(error));
  }
}
