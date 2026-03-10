import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { processSimulationQueue } from '@/lib/simulation-worker';

const bodySchema = z.object({
  limit: z.number().int().min(1).max(10).optional(),
});

class WorkerConfigurationError extends Error {}

function getConfiguredWorkerToken() {
  const configuredToken = env.SIMULATION_WORKER_TOKEN?.trim();
  if (!configuredToken) {
    throw new WorkerConfigurationError('SIMULATION_WORKER_TOKEN is not configured.');
  }
  return configuredToken;
}

function timingSafeEqualText(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

function isWorkerAuthorized(request: NextRequest, configuredToken: string) {
  const token =
    request.headers.get('x-worker-token') ??
    request.nextUrl.searchParams.get('token') ??
    '';
  const normalizedToken = token.trim();
  if (!normalizedToken) return false;
  return timingSafeEqualText(normalizedToken, configuredToken);
}

export async function POST(request: NextRequest) {
  try {
    const configuredToken = getConfiguredWorkerToken();
    if (!isWorkerAuthorized(request, configuredToken)) {
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
    const status = error instanceof WorkerConfigurationError ? 500 : 400;
    const message =
      error instanceof WorkerConfigurationError ? error.message : String(error);
    return NextResponse.json({ error: message }, { status });
  }
}
