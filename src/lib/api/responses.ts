import { NextResponse } from 'next/server';

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json(
    { error: message, details: details ?? null },
    {
      status: 400,
    }
  );
}

export function internalError(message: string, details?: unknown) {
  return NextResponse.json(
    { error: message, details: details ?? null },
    {
      status: 500,
    }
  );
}
