import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDbReady } from '@/lib/db/init';
import { llmConfig } from '@/lib/db/schema';
import { badRequest, internalError } from '@/lib/api/responses';
import { generateId } from '@/lib/utils';

export async function GET() {
  try {
    await ensureDbReady();
    const rows = await db.select().from(llmConfig);
    const active = rows.find((row) => row.isActive) ?? null;
    return NextResponse.json({ active, providers: rows });
  } catch (error) {
    return internalError('Failed to fetch LLM settings', String(error));
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureDbReady();
    const payload = (await request.json()) as Partial<{
      provider: 'openai' | 'anthropic' | 'google' | 'groq' | 'ollama';
      modelName: string;
      apiKey: string;
      baseUrl: string;
    }>;

    if (!payload.provider || !payload.modelName?.trim()) {
      return badRequest('provider and modelName are required');
    }

    await db.update(llmConfig).set({ isActive: false }).where(eq(llmConfig.isActive, true));

    const row = {
      id: generateId(),
      provider: payload.provider,
      modelName: payload.modelName.trim(),
      apiKey: payload.apiKey?.trim() || null,
      baseUrl: payload.baseUrl?.trim() || null,
      isActive: true,
      createdAt: new Date(),
    };

    await db.insert(llmConfig).values(row);
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    return internalError('Failed to save LLM settings', String(error));
  }
}
