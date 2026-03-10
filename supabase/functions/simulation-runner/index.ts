import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

function resolveAppBaseUrl() {
  const configured =
    Deno.env.get('APP_BASE_URL')?.trim() || Deno.env.get('NEXT_PUBLIC_APP_URL')?.trim() || '';
  if (!configured) {
    throw new Error(
      'APP_BASE_URL or NEXT_PUBLIC_APP_URL must be configured for simulation-runner.',
    );
  }
  return configured.replace(/\/$/, '');
}

function resolveWorkerToken() {
  const token = Deno.env.get('SIMULATION_WORKER_TOKEN')?.trim() || '';
  if (!token) {
    throw new Error('SIMULATION_WORKER_TOKEN must be configured for simulation-runner.');
  }
  return token;
}

serve(async (request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const payloadText = await request.text();
    const workerResponse = await fetch(`${resolveAppBaseUrl()}/api/simulations/worker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-token': resolveWorkerToken(),
      },
      body: payloadText.trim().length ? payloadText : '{}',
    });

    return new Response(await workerResponse.text(), {
      status: workerResponse.status,
      headers: { 'Content-Type': workerResponse.headers.get('content-type') ?? 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
});
