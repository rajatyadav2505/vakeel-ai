// Supabase Edge Function example for WhatsApp relay.
// Deploy with: supabase functions deploy whatsapp-relay

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const payload = await request.json();
  // TODO: verify provider signature + route to case owner workspace.
  console.log('Incoming WhatsApp payload', payload);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
