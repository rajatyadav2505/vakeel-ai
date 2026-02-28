import { env } from '@/lib/env';

export async function sendWhatsAppText(params: { to: string; text: string }) {
  if (!env.GUPSHUP_API_KEY || !env.GUPSHUP_APP_NAME) {
    throw new Error('Gupshup integration is not configured');
  }

  const body = new URLSearchParams();
  body.set('channel', 'whatsapp');
  body.set('source', env.GUPSHUP_APP_NAME);
  body.set('destination', params.to);
  body.set('message', JSON.stringify({ type: 'text', text: params.text }));

  const response = await fetch('https://api.gupshup.io/wa/api/v1/msg', {
    method: 'POST',
    headers: {
      apikey: env.GUPSHUP_API_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gupshup send failed: ${response.status} ${text}`);
  }

  return response.json();
}
