import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbReady } from '@/lib/db/init';
import { serializeCitations, serializePetitionContent } from '@/lib/db/serializers';
import { cases, petitions } from '@/lib/db/schema';
import { badRequest, internalError } from '@/lib/api/responses';
import { generatePetitionDraft } from '@/lib/ai/petitions/generator';
import type { PetitionGenerationRequest } from '@/types/petition';

export async function POST(request: NextRequest) {
  try {
    await ensureDbReady();
    const payload = (await request.json()) as Partial<PetitionGenerationRequest>;

    if (!payload.petitionType || !payload.court?.trim() || !payload.title?.trim()) {
      return badRequest('petitionType, court, and title are required');
    }
    if (!payload.facts?.trim() || !payload.legalGrounds?.trim() || !payload.reliefSought?.trim()) {
      return badRequest('facts, legalGrounds, and reliefSought are required');
    }

    const linkedCase =
      payload.caseId &&
      (
        await db
          .select()
          .from(cases)
          .where(eq(cases.id, payload.caseId))
          .limit(1)
      )[0];

    const petition = await generatePetitionDraft({
      request: {
        petitionType: payload.petitionType,
        court: payload.court.trim(),
        title: payload.title.trim(),
        caseId: payload.caseId,
        facts: payload.facts.trim(),
        legalGrounds: payload.legalGrounds.trim(),
        reliefSought: payload.reliefSought.trim(),
        additionalContext: payload.additionalContext?.trim(),
      },
      caseData: linkedCase || null,
    });

    await db.insert(petitions).values({
      id: petition.id,
      caseId: petition.caseId,
      petitionType: petition.petitionType,
      court: petition.court,
      title: petition.title,
      content: serializePetitionContent(petition.content),
      citations: serializeCitations(petition.citations),
      status: petition.status,
      generatedAt: new Date(petition.generatedAt),
      updatedAt: new Date(petition.updatedAt),
    });

    return NextResponse.json(petition, { status: 201 });
  } catch (error) {
    return internalError('Failed to generate petition draft', String(error));
  }
}
