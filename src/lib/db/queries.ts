import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ensureDbReady } from '@/lib/db/init';
import { deserializePetitionRow, deserializeStrategyRow, parseWarRoomConfig } from '@/lib/db/serializers';
import {
  caseTimeline,
  cases,
  documents,
  hearings,
  petitions,
  strategyAnalyses,
  warRoomMessages,
  warRoomSessions,
} from '@/lib/db/schema';

export async function getCases() {
  await ensureDbReady();
  return db.select().from(cases).orderBy(desc(cases.updatedAt));
}

export async function getCaseDetails(caseId: string) {
  await ensureDbReady();
  const [caseRow] = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);
  if (!caseRow) return null;

  const [timelineRows, hearingRows, documentRows] = await Promise.all([
    db.select().from(caseTimeline).where(eq(caseTimeline.caseId, caseId)).orderBy(asc(caseTimeline.eventDate)),
    db.select().from(hearings).where(eq(hearings.caseId, caseId)).orderBy(asc(hearings.date)),
    db.select().from(documents).where(eq(documents.caseId, caseId)).orderBy(desc(documents.createdAt)),
  ]);

  return {
    case: caseRow,
    timeline: timelineRows,
    hearings: hearingRows,
    documents: documentRows,
  };
}

export async function getPetitions() {
  await ensureDbReady();
  const rows = await db.select().from(petitions).orderBy(desc(petitions.updatedAt));
  return rows.map((row) => deserializePetitionRow(row));
}

export async function getPetitionById(id: string) {
  await ensureDbReady();
  const [row] = await db.select().from(petitions).where(eq(petitions.id, id)).limit(1);
  return row ? deserializePetitionRow(row) : null;
}

export async function getLatestStrategy(caseId: string) {
  await ensureDbReady();
  const [row] = await db
    .select()
    .from(strategyAnalyses)
    .where(eq(strategyAnalyses.caseId, caseId))
    .orderBy(desc(strategyAnalyses.createdAt))
    .limit(1);
  return row ? deserializeStrategyRow(row) : null;
}

export async function getRecentWarSessions(caseId?: string) {
  await ensureDbReady();
  const sessions = caseId
    ? await db
        .select()
        .from(warRoomSessions)
        .where(eq(warRoomSessions.caseId, caseId))
        .orderBy(desc(warRoomSessions.startedAt))
    : await db.select().from(warRoomSessions).orderBy(desc(warRoomSessions.startedAt));

  return sessions.map((session) => ({
    ...session,
    config: parseWarRoomConfig(session.config),
  }));
}

export async function getWarSessionById(sessionId: string) {
  await ensureDbReady();
  const [session] = await db.select().from(warRoomSessions).where(eq(warRoomSessions.id, sessionId)).limit(1);
  if (!session) return null;

  const messages = await db
    .select()
    .from(warRoomMessages)
    .where(eq(warRoomMessages.sessionId, sessionId))
    .orderBy(asc(warRoomMessages.phase), asc(warRoomMessages.timestamp));

  return {
    ...session,
    config: parseWarRoomConfig(session.config),
    messages,
  };
}
