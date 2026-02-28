'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { supabaseBrowser } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const STAGES = [
  { key: 'intake', label: 'Intake', dot: 'bg-blue-500' },
  { key: 'analysis', label: 'Analysis', dot: 'bg-amber-500' },
  { key: 'filing', label: 'Filing', dot: 'bg-emerald-500' },
  { key: 'hearing', label: 'Hearing', dot: 'bg-violet-500' },
  { key: 'closed', label: 'Closed', dot: 'bg-slate-500' },
] as const;

type CaseStage = (typeof STAGES)[number]['key'];
const STAGE_SET = new Set<CaseStage>(STAGES.map((stage) => stage.key));

interface CaseCardItem {
  id: string;
  title: string;
  case_type: string;
  stage: string;
  court_name: string | null;
  updated_at: string;
}

export function CasesKanbanBoard(props: {
  userId: string;
  initialCases: CaseCardItem[];
  realtimeEnabled?: boolean;
}) {
  const [cases, setCases] = useState<CaseCardItem[]>(props.initialCases);
  const [draggingCaseId, setDraggingCaseId] = useState<string | null>(null);
  const [hoverStage, setHoverStage] = useState<CaseStage | null>(null);
  const [status, setStatus] = useState('');
  const channelRef = useRef<ReturnType<typeof supabaseBrowser.channel> | null>(null);

  function applyStageUpdate(caseId: string, stage: string) {
    if (!STAGE_SET.has(stage as CaseStage)) return;
    setCases((previous) =>
      previous.map((item) => (item.id === caseId ? { ...item, stage } : item))
    );
  }

  useEffect(() => {
    setCases(props.initialCases);
  }, [props.initialCases]);

  useEffect(() => {
    if (props.realtimeEnabled === false) return;

    const channel = supabaseBrowser
      .channel(`cases-board:${props.userId}`)
      .on('broadcast', { event: 'stage-updated' }, (event) => {
        const payload = event.payload as { caseId?: string; stage?: string };
        const stage = payload.stage;
        if (!payload.caseId || typeof stage !== 'string') return;
        applyStageUpdate(payload.caseId, stage);
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'cases', filter: `owner_user_id=eq.${props.userId}` },
        (payload) => {
          const next = payload.new as { id?: string; stage?: string };
          if (!next.id || typeof next.stage !== 'string') return;
          applyStageUpdate(next.id, next.stage);
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      void channel.unsubscribe();
    };
  }, [props.realtimeEnabled, props.userId]);

  const groupedCases = useMemo(() => {
    return STAGES.map((stage) => ({
      stage,
      items: cases.filter((item) => item.stage === stage.key),
    }));
  }, [cases]);

  async function updateStage(caseId: string, nextStage: CaseStage) {
    const currentCase = cases.find((item) => item.id === caseId);
    if (!currentCase || currentCase.stage === nextStage) return;

    setStatus('Updating stage...');
    applyStageUpdate(caseId, nextStage);

    const response = await fetch(`/api/cases/${caseId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage: nextStage }),
    });

    if (!response.ok) {
      setCases((previous) =>
        previous.map((item) => (item.id === caseId ? { ...item, stage: currentCase.stage } : item))
      );
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setStatus(payload?.error ?? 'Failed to update stage.');
      return;
    }

    setStatus('Stage updated.');
    if (channelRef.current) {
      void channelRef.current.send({
        type: 'broadcast',
        event: 'stage-updated',
        payload: { caseId, stage: nextStage },
      });
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-5">
        {groupedCases.map(({ stage, items }) => (
          <Card
            key={stage.key}
            onDragOver={(event) => {
              event.preventDefault();
              setHoverStage(stage.key);
            }}
            onDragLeave={() => setHoverStage((current) => (current === stage.key ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              const caseId = event.dataTransfer.getData('text/case-id');
              setHoverStage(null);
              if (caseId) {
                void updateStage(caseId, stage.key);
              }
            }}
            className={cn(
              'space-y-2 p-3 transition',
              hoverStage === stage.key && 'border-primary/50 bg-primary/5'
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className={`inline-block h-2 w-2 rounded-full ${stage.dot}`} />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {stage.label}
                </p>
              </div>
              {items.length > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
                  {items.length}
                </span>
              )}
            </div>

            {items.map((item) => (
              <Link
                href={`/cases/${item.id}`}
                key={item.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/case-id', item.id);
                  event.dataTransfer.effectAllowed = 'move';
                  setDraggingCaseId(item.id);
                }}
                onDragEnd={() => setDraggingCaseId(null)}
                className={cn(
                  'group block rounded-lg border border-border bg-background p-2.5 text-xs hover:border-primary/20 hover:bg-muted/40',
                  draggingCaseId === item.id && 'opacity-50'
                )}
              >
                <p className="font-medium group-hover:text-primary">{item.title}</p>
                <p className="mt-0.5 text-muted-foreground">{item.case_type}</p>
              </Link>
            ))}

            {items.length === 0 && (
              <p className="py-3 text-center text-[11px] text-muted-foreground">No cases</p>
            )}
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Drag a case card and drop it into another stage to update lifecycle status.
        {status ? ` ${status}` : ''}
      </p>
    </div>
  );
}
