import { NextRequest, NextResponse } from 'next/server';
import { searchKanoon } from '@nyaya/agents';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q') ?? '';
  if (!query.trim()) {
    return NextResponse.json({ error: 'q is required' }, { status: 400 });
  }

  const results = await searchKanoon(query);
  return NextResponse.json({ results });
}
