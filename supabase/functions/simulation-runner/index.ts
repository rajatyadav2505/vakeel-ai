// Supabase Edge Function example to trigger async simulation jobs.
// Queue integration can be connected with Upstash or pgmq.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const payload = await request.json();
  console.log('Simulation job received', payload);

  return new Response(JSON.stringify({ queued: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
