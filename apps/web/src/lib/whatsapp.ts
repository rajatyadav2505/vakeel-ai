import { env } from '@/lib/env';

export interface WhatsAppTemplateDefinition {
  id: 'case_update_ack' | 'document_request' | 'hearing_reminder';
  label: string;
  body: {
    'en-IN': string;
    'hi-IN': string;
  };
  buttons: Array<{
    id: string;
    title: {
      'en-IN': string;
      'hi-IN': string;
    };
  }>;
}

export const WHATSAPP_INTERACTIVE_TEMPLATES: WhatsAppTemplateDefinition[] = [
  {
    id: 'case_update_ack',
    label: 'Case update acknowledgement',
    body: {
      'en-IN': 'Case update shared. Please confirm your preferred next action.',
      'hi-IN': 'मामले का अपडेट साझा कर दिया गया है। कृपया अगला पसंदीदा कदम चुनें।',
    },
    buttons: [
      {
        id: 'ack_review',
        title: {
          'en-IN': 'Review with lawyer',
          'hi-IN': 'वकील के साथ समीक्षा',
        },
      },
      {
        id: 'ack_settlement',
        title: {
          'en-IN': 'Explore settlement',
          'hi-IN': 'समझौता विकल्प देखें',
        },
      },
      {
        id: 'ack_hearing',
        title: {
          'en-IN': 'Prepare hearing',
          'hi-IN': 'सुनवाई की तैयारी',
        },
      },
    ],
  },
  {
    id: 'document_request',
    label: 'Document request',
    body: {
      'en-IN': 'To strengthen filing, please share pending records.',
      'hi-IN': 'फाइलिंग मजबूत करने के लिए कृपया लंबित दस्तावेज साझा करें।',
    },
    buttons: [
      {
        id: 'doc_upload_today',
        title: {
          'en-IN': 'Upload today',
          'hi-IN': 'आज अपलोड करूँगा',
        },
      },
      {
        id: 'doc_need_help',
        title: {
          'en-IN': 'Need help',
          'hi-IN': 'सहायता चाहिए',
        },
      },
      {
        id: 'doc_not_available',
        title: {
          'en-IN': 'Not available',
          'hi-IN': 'उपलब्ध नहीं',
        },
      },
    ],
  },
  {
    id: 'hearing_reminder',
    label: 'Hearing readiness check',
    body: {
      'en-IN': 'Hearing prep checkpoint: confirm attendance and documents.',
      'hi-IN': 'सुनवाई तैयारी जांच: उपस्थिति और दस्तावेज़ की पुष्टि करें।',
    },
    buttons: [
      {
        id: 'hearing_confirmed',
        title: {
          'en-IN': 'Confirmed',
          'hi-IN': 'पुष्टि',
        },
      },
      {
        id: 'hearing_reschedule',
        title: {
          'en-IN': 'Need reschedule',
          'hi-IN': 'तारीख बदलनी है',
        },
      },
      {
        id: 'hearing_callback',
        title: {
          'en-IN': 'Call me',
          'hi-IN': 'मुझे कॉल करें',
        },
      },
    ],
  },
];

function getConfiguredGupshupCreds() {
  const appName = env.GUPSHUP_APP_NAME;
  const apiKey = env.GUPSHUP_API_KEY;
  if (!apiKey || !appName) {
    throw new Error('Gupshup integration is not configured');
  }
  return { appName, apiKey };
}

async function sendGupshupMessage(params: { to: string; message: Record<string, unknown> }) {
  const creds = getConfiguredGupshupCreds();
  const body = new URLSearchParams();
  body.set('channel', 'whatsapp');
  body.set('source', creds.appName);
  body.set('destination', params.to);
  body.set('message', JSON.stringify(params.message));

  const response = await fetch('https://api.gupshup.io/wa/api/v1/msg', {
    method: 'POST',
    headers: {
      apikey: creds.apiKey,
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

export async function sendWhatsAppText(params: { to: string; text: string }) {
  return sendGupshupMessage({
    to: params.to,
    message: { type: 'text', text: params.text },
  });
}

export function resolveWhatsAppTemplate(
  templateId: WhatsAppTemplateDefinition['id'],
  locale: 'en-IN' | 'hi-IN'
) {
  const template = WHATSAPP_INTERACTIVE_TEMPLATES.find((item) => item.id === templateId);
  if (!template) return null;

  return {
    id: template.id,
    label: template.label,
    text: template.body[locale],
    buttons: template.buttons.map((button) => ({
      id: button.id,
      title: button.title[locale].slice(0, 20),
    })),
  };
}

export async function sendWhatsAppInteractiveTemplate(params: {
  to: string;
  templateId: WhatsAppTemplateDefinition['id'];
  locale: 'en-IN' | 'hi-IN';
}) {
  const resolved = resolveWhatsAppTemplate(params.templateId, params.locale);
  if (!resolved) {
    throw new Error(`Unknown WhatsApp template: ${params.templateId}`);
  }

  const interactivePayload = {
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: resolved.text },
      action: {
        buttons: resolved.buttons.map((button) => ({
          type: 'reply',
          reply: {
            id: button.id,
            title: button.title,
          },
        })),
      },
    },
  };

  try {
    const response = await sendGupshupMessage({
      to: params.to,
      message: interactivePayload,
    });
    return {
      response,
      resolved,
      fallback: false,
    };
  } catch (error) {
    // Some providers/channels may reject interactive payloads. Fall back to deterministic text.
    const textFallback = [
      resolved.text,
      '',
      ...resolved.buttons.map((button, index) => `${index + 1}. ${button.title} [${button.id}]`),
    ].join('\n');
    const response = await sendWhatsAppText({ to: params.to, text: textFallback });
    return {
      response,
      resolved,
      fallback: true,
    };
  }
}
