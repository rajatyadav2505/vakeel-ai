import { NextResponse } from 'next/server';

export function GET() {
  return NextResponse.json({ ok: true, service: 'nyaya-web', time: new Date().toISOString() });
}
