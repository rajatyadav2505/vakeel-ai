'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, Send, Webhook } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabaseBrowser } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface ConversationPreview {
  phone: string;
  lastMessage: string;
  updatedAt: string;
}

interface ConversationMessage {
  id: string;
  body: string;
  messageId: string;
  mediaUrl: string | null;
  contactPhone: string;
  direction: 'inbound' | 'outbound';
  deliveryStatus: string;
  createdAt: string;
}

interface HistoryPayload {
  ok: boolean;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: ConversationMessage[];
  conversations: ConversationPreview[];
}

function formatTime(iso: string) {
  const date = new Date(iso);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export default function WhatsAppPage() {
  const [status, setStatus] = useState('Loading conversations...');
  const [messageText, setMessageText] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [selectedPhone, setSelectedPhone] = useState('');
  const [groundedLegalReply, setGroundedLegalReply] = useState(false);
  const [groundingCaseId, setGroundingCaseId] = useState('');
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [realtimeEnabled, setRealtimeEnabled] = useState(true);

  const selectedPhoneRef = useRef(selectedPhone);
  const pageRef = useRef(page);

  useEffect(() => {
    selectedPhoneRef.current = selectedPhone;
  }, [selectedPhone]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  async function loadHistory(nextPhone: string, nextPage: number) {
    setLoading(true);
    const search = new URLSearchParams();
    search.set('page', String(nextPage));
    search.set('pageSize', '20');
    if (nextPhone) search.set('phone', nextPhone);

    const response = await fetch(`/api/whatsapp/messages?${search.toString()}`);
    if (!response.ok) {
      setStatus('Failed to load message history.');
      setLoading(false);
      return;
    }

    const payload = (await response.json()) as HistoryPayload;
    setConversations(payload.conversations ?? []);
    setMessages([...(payload.items ?? [])].reverse());
    setTotalPages(payload.totalPages ?? 1);
    setPage(payload.page ?? 1);

    if (!nextPhone && (payload.conversations?.length ?? 0) > 0) {
      const firstPhone = payload.conversations[0]?.phone ?? '';
      if (firstPhone) {
        setSelectedPhone(firstPhone);
      }
    }

    if (!nextPhone && (!payload.conversations || payload.conversations.length === 0)) {
      setStatus('No messages yet. Send the first WhatsApp update.');
    } else {
      setStatus('Conversation history updated.');
    }
    setLoading(false);
  }

  useEffect(() => {
    async function bootstrap() {
      const settingsResponse = await fetch('/api/settings');
      if (settingsResponse.ok) {
        const payload = (await settingsResponse.json()) as {
          settings?: { realtimeUpdatesEnabled?: boolean };
        };
        if (typeof payload.settings?.realtimeUpdatesEnabled === 'boolean') {
          setRealtimeEnabled(payload.settings.realtimeUpdatesEnabled);
        }
      }
      await loadHistory('', 1);
    }

    void bootstrap();
  }, []);

  useEffect(() => {
    if (!realtimeEnabled) {
      setRealtimeConnected(false);
      return;
    }

    const channel = supabaseBrowser
      .channel('whatsapp-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_messages' },
        () => {
          const livePhone = selectedPhoneRef.current;
          const livePage = pageRef.current;
          void loadHistory(livePhone, livePage);
        }
      )
      .subscribe((statusCode) => {
        setRealtimeConnected(statusCode === 'SUBSCRIBED');
      });

    return () => {
      void channel.unsubscribe();
    };
  }, [realtimeEnabled]);

  async function onSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const to = (selectedPhone || manualPhone).trim();
    if (!to || !messageText.trim()) {
      setStatus('Phone and message are required.');
      return;
    }
    if (groundedLegalReply && !groundingCaseId.trim()) {
      setStatus('Case ID is required for grounded legal replies.');
      return;
    }

    setStatus('Sending...');
    const response = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        text: messageText,
        ...(groundedLegalReply
          ? {
              groundedLegalReply: true,
              caseId: groundingCaseId.trim(),
              legalQuery: messageText,
            }
          : {}),
      }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setStatus(data.error ?? 'Failed');
      return;
    }

    setMessageText('');
    setManualPhone('');
    setSelectedPhone(to);
    await loadHistory(to, 1);
    setStatus('Message queued successfully.');
  }

  async function goToPage(nextPage: number) {
    const bounded = Math.max(1, Math.min(totalPages, nextPage));
    await loadHistory(selectedPhone, bounded);
  }

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.phone === selectedPhone) ?? null,
    [conversations, selectedPhone]
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-[Georgia] text-xl font-semibold">WhatsApp Ops</h1>
        <p className="text-sm text-muted-foreground">
          Manage live client communication threads with history, pagination, and real-time updates.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Conversations</p>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                realtimeEnabled && realtimeConnected
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  realtimeEnabled && realtimeConnected ? 'bg-emerald-500' : 'bg-slate-400'
                )}
              />
              {realtimeEnabled ? 'realtime' : 'realtime off'}
            </span>
          </div>

          <Label>
            Start new chat
            <Input
              value={manualPhone}
              onChange={(event) => setManualPhone(event.target.value)}
              placeholder="91XXXXXXXXXX"
            />
          </Label>

          <div className="max-h-[450px] space-y-2 overflow-auto pr-1">
            {conversations.map((conversation) => (
              <button
                key={conversation.phone}
                type="button"
                onClick={() => {
                  setSelectedPhone(conversation.phone);
                  void loadHistory(conversation.phone, 1);
                }}
                className={cn(
                  'w-full rounded-xl border border-border bg-background p-2.5 text-left',
                  selectedPhone === conversation.phone && 'border-primary/40 bg-primary/5'
                )}
              >
                <p className="text-xs font-semibold">{conversation.phone}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{conversation.lastMessage}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">{formatTime(conversation.updatedAt)}</p>
              </button>
            ))}
            {conversations.length === 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-border p-3">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">No conversations yet.</p>
              </div>
            )}
          </div>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">
                {selectedPhone ? `Conversation: ${selectedPhone}` : 'Select a conversation'}
              </p>
              {activeConversation && (
                <p className="text-xs text-muted-foreground">
                  Last update {formatTime(activeConversation.updatedAt)}
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {loading ? 'Refreshing...' : `${messages.length} messages on this page`}
            </p>
          </div>

          <div className="max-h-[420px] space-y-2 overflow-auto rounded-xl border border-border bg-background p-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'max-w-[86%] rounded-2xl px-3 py-2 text-sm',
                  message.direction === 'outbound'
                    ? 'ml-auto bg-primary/10 text-primary'
                    : 'mr-auto bg-muted text-foreground'
                )}
              >
                <p>{message.body}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {formatTime(message.createdAt)} {message.direction === 'outbound' ? `• ${message.deliveryStatus}` : ''}
                </p>
              </div>
            ))}
            {messages.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No messages for this conversation yet.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" onClick={() => void goToPage(page - 1)} disabled={page <= 1 || loading}>
              Previous
            </Button>
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void goToPage(page + 1)}
              disabled={page >= totalPages || loading}
            >
              Next
            </Button>
          </div>

          <form className="space-y-3 rounded-xl border border-border bg-background p-3" onSubmit={onSend}>
            <Label>
              Send to
              <Input
                value={selectedPhone || manualPhone}
                onChange={(event) => {
                  setSelectedPhone('');
                  setManualPhone(event.target.value);
                }}
                placeholder="91XXXXXXXXXX"
                required
              />
            </Label>
            <Label>
              Message
              <Textarea
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                rows={4}
                required
                placeholder="Case update summary for client..."
              />
            </Label>
            <Label>
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={groundedLegalReply}
                  onChange={(event) => setGroundedLegalReply(event.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                Ground with Indian legal authorities
              </span>
            </Label>
            {groundedLegalReply && (
              <Label>
                Case ID for legal grounding
                <Input
                  value={groundingCaseId}
                  onChange={(event) => setGroundingCaseId(event.target.value)}
                  placeholder="Case UUID"
                  required
                />
              </Label>
            )}
            <div className="flex items-center gap-3">
              <Button type="submit">
                <Send className="mr-1.5 h-3.5 w-3.5" /> Send update
              </Button>
              <p className="text-xs text-muted-foreground">{status}</p>
            </div>
          </form>
        </Card>
      </div>

      <Card className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Webhook className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">Webhook endpoint</p>
          <code className="text-xs text-muted-foreground">POST /api/whatsapp/webhook</code>
        </div>
      </Card>
    </div>
  );
}
