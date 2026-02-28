import { asc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbReady } from '@/lib/db/init';
import { parseWarRoomConfig } from '@/lib/db/serializers';
import { warRoomMessages, warRoomSessions } from '@/lib/db/schema';
import { internalError } from '@/lib/api/responses';

export async function GET(
  _: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    await ensureDbReady();
    const { sessionId } = await context.params;
    const sessionRows = await db
      .select()
      .from(warRoomSessions)
      .where(eq(warRoomSessions.id, sessionId))
      .limit(1);

    if (!sessionRows[0]) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const messages = await db
      .select()
      .from(warRoomMessages)
      .where(eq(warRoomMessages.sessionId, sessionId))
      .orderBy(asc(warRoomMessages.phase), asc(warRoomMessages.timestamp));

    const session = sessionRows[0];
    return NextResponse.json({
      ...session,
      config: parseWarRoomConfig(session.config),
      messages,
    });
  } catch (error) {
    return internalError('Failed to fetch war-room session', String(error));
  }
}
