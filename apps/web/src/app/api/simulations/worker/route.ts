import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { processSimulationQueue } from '@/lib/simulation-worker';

const bodySchema = z.object({
  limit: z.number().int().min(1).max(10).optional(),
});

function isWorkerAuthorized(request: NextRequest) {
  const configuredToken = env.SIMULATION_WORKER_TOKEN?.trim();
  if (!configuredToken) return true;
  const token =
    request.headers.get('x-worker-token') ??
    request.nextUrl.searchParams.get('token') ??
    '';
  return token === configuredToken;
}

export async function POST(request: NextRequest) {
  try {
    if (!isWorkerAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized worker token.' }, { status: 401 });
    }

    const rawBody = await request.text();
    const parsed = rawBody.trim().length
      ? bodySchema.parse(JSON.parse(rawBody))
      : { limit: undefined };

    const output = await processSimulationQueue(
      typeof parsed.limit === 'number' ? { limit: parsed.limit } : undefined
    );
    return NextResponse.json({ ok: true, ...output });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
