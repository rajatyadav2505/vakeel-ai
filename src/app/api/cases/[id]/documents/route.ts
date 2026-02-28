import { desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbReady } from '@/lib/db/init';
import { documents } from '@/lib/db/schema';
import { badRequest, internalError } from '@/lib/api/responses';
import { generateId } from '@/lib/utils';
import type { DocType } from '@/types/case';

const DOC_TYPES: DocType[] = ['petition', 'affidavit', 'evidence', 'order', 'memo'];

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDbReady();
    const { id } = await context.params;
    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.caseId, id))
      .orderBy(desc(documents.createdAt));
    return NextResponse.json(rows);
  } catch (error) {
    return internalError('Failed to fetch documents', String(error));
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await ensureDbReady();
    const { id } = await context.params;
    const payload = (await request.json()) as Partial<{
      title: string;
      docType: DocType;
      filePath: string;
      content: string;
    }>;

    if (!payload.title?.trim()) {
      return badRequest('title is required');
    }
    if (!payload.docType || !DOC_TYPES.includes(payload.docType)) {
      return badRequest('docType is invalid');
    }

    const document = {
      id: generateId(),
      caseId: id,
      title: payload.title.trim(),
      docType: payload.docType,
      filePath: payload.filePath?.trim() || null,
      content: payload.content?.trim() || null,
      createdAt: new Date(),
    };

    await db.insert(documents).values(document);
    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    return internalError('Failed to add document', String(error));
  }
}
