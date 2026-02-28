export interface WhatsappOutboundMessage {
  to: string;
  body: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function base64(input: string): string {
  return Buffer.from(input).toString('base64');
}

export async function sendWhatsappMessage(message: WhatsappOutboundMessage): Promise<{
  sid: string;
  status: string;
}> {
  const accountSid = required('TWILIO_ACCOUNT_SID');
  const authToken = required('TWILIO_AUTH_TOKEN');
  const fromNumber = required('TWILIO_WHATSAPP_FROM');

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const body = new URLSearchParams();
  body.set('To', `whatsapp:${message.to}`);
  body.set('From', `whatsapp:${fromNumber}`);
  body.set('Body', message.body);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${base64(`${accountSid}:${authToken}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twilio send failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as { sid: string; status: string };
  return data;
}
