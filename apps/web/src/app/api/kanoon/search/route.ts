import { NextRequest, NextResponse } from 'next/server';
import { searchKanoon } from '@nyaya/agents';
import { z } from 'zod';
import { enforceRateLimit } from '@/lib/rate-limit';

const kanoonQuerySchema = z
  .string()
  .trim()
  .min(2, 'q must be at least 2 characters')
  .max(300, 'q must be 300 characters or fewer')
  .refine((value) => !/[<>]/.test(value), 'q contains unsupported characters')
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'q contains control characters');

export async function GET(request: NextRequest) {
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')?.trim()
    ?? 'anonymous';
  await enforceRateLimit(`kanoon-search:${clientIp}`, 30);

  const parsed = kanoonQuerySchema.safeParse(request.nextUrl.searchParams.get('q') ?? '');
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid q' }, { status: 400 });
  }

  const results = await searchKanoon(parsed.data);
  return NextResponse.json({ results });
}
