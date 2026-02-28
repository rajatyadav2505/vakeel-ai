import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  cnrNumber: z.string().min(6),
});

export async function POST(request: NextRequest) {
  try {
    const payload = schema.parse(await request.json());

    // Placeholder for live e-Courts integration in phase 2.
    return NextResponse.json({
      ok: true,
      cnrNumber: payload.cnrNumber,
      status: 'queued',
      message: 'e-Courts sync scheduled. Connect production adapter in phase 2.',
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 400 });
  }
}
