'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SectionCard } from '@/components/ui/section-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/utils';
import type { StrategyAnalysis } from '@/types/strategy';

interface CaseWorkbenchProps {
  caseData: {
    id: string;
    title: string;
    caseType: string;
    status: string;
    court: string | null;
    caseNumber: string | null;
    description: string | null;
    nextHearing: string | null;
    clientName: string | null;
    opponentName: string | null;
    opponentAdvocate: string | null;
  };
  timeline: Array<{
    id: string;
    eventDate: string;
    eventType: string;
    title: string;
    description: string | null;
  }>;
  hearings: Array<{
    id: string;
    date: string;
    purpose: string | null;
    status: string;
    court: string | null;
  }>;
  documents: Array<{
    id: string;
    title: string;
    docType: string;
    createdAt: Date;
  }>;
  latestStrategy: StrategyAnalysis | null;
  recentSession: {
    id: string;
    sessionName: string;
    status: string;
    startedAt: Date;
  } | null;
}

export function CaseWorkbench(props: CaseWorkbenchProps) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<'strategy' | 'warroom' | null>(null);
  const [error, setError] = useState('');
  const [objective, setObjective] = useState(
    'Stay at least two procedural moves ahead and secure favorable relief.'
  );

  async function submitTimeline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const response = await fetch(`/api/cases/${props.caseData.id}/timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventDate: formData.get('eventDate'),
        eventType: formData.get('eventType'),
        title: formData.get('title'),
        description: formData.get('description'),
      }),
    });

    if (response.ok) {
      event.currentTarget.reset();
      router.refresh();
    }
  }

  async function submitHearing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const response = await fetch(`/api/cases/${props.caseData.id}/hearings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: formData.get('date'),
        purpose: formData.get('purpose'),
        court: formData.get('court'),
      }),
    });

    if (response.ok) {
      event.currentTarget.reset();
      router.refresh();
    }
  }

  async function submitDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    const response = await fetch(`/api/cases/${props.caseData.id}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: formData.get('title'),
        docType: formData.get('docType'),
        content: formData.get('content'),
      }),
    });

    if (response.ok) {
      event.currentTarget.reset();
      router.refresh();
    }
  }

  async function runStrategy() {
    setError('');
    setLoadingAction('strategy');
    const response = await fetch('/api/strategy/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caseId: props.caseData.id,
        objective,
        caseBrief: props.caseData.description ?? '',
      }),
    });
    setLoadingAction(null);
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? 'Failed to run strategy analysis');
      return;
    }
    router.push(`/strategy/${props.caseData.id}`);
    router.refresh();
  }

  async function runWarRoom() {
    setError('');
    setLoadingAction('warroom');
    const response = await fetch('/api/war-room/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caseId: props.caseData.id,
        objective,
        caseBrief: props.caseData.description ?? '',
      }),
    });
    setLoadingAction(null);
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? 'Failed to start war-room simulation');
      return;
    }
    const data = (await response.json()) as { sessionId: string };
    router.push(`/war-room/${data.sessionId}`);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#d9d3c1] bg-white/85 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-[Georgia] text-2xl font-semibold text-[#1e2a39]">{props.caseData.title}</h1>
            <p className="text-sm text-[#607086]">
              {props.caseData.caseType.toUpperCase()}
              {props.caseData.caseNumber ? ` • ${props.caseData.caseNumber}` : ''}
              {props.caseData.court ? ` • ${props.caseData.court}` : ''}
            </p>
          </div>
          <StatusBadge status={props.caseData.status} />
        </div>

        <p className="mt-3 text-sm text-[#4f6074]">
          {props.caseData.description || 'No case description added yet.'}
        </p>

        <div className="mt-4 grid gap-2 text-sm text-[#4f6074] md:grid-cols-2">
          <p>
            <span className="font-semibold text-[#233346]">Client:</span> {props.caseData.clientName || 'N/A'}
          </p>
          <p>
            <span className="font-semibold text-[#233346]">Opponent:</span> {props.caseData.opponentName || 'N/A'}
          </p>
          <p>
            <span className="font-semibold text-[#233346]">Opponent Counsel:</span>{' '}
            {props.caseData.opponentAdvocate || 'N/A'}
          </p>
          <p>
            <span className="font-semibold text-[#233346]">Next Hearing:</span>{' '}
            {props.caseData.nextHearing || 'Not listed'}
          </p>
        </div>
      </section>

      <SectionCard
        title="Strategic Console"
        subtitle="Run Chanakya + game-theory analysis and 20-agent war gaming."
      >
        <label className="text-sm font-medium text-[#334458]">
          Litigation objective
          <textarea
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            rows={2}
            placeholder="State desired legal outcome and tactical intent."
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={runStrategy}
            disabled={loadingAction !== null}
            className="rounded-xl bg-[#1e334a] px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
          >
            {loadingAction === 'strategy' ? 'Analyzing...' : 'Run Strategy Analysis'}
          </button>
          <button
            onClick={runWarRoom}
            disabled={loadingAction !== null}
            className="rounded-xl border border-[#bfb7a1] bg-white px-3 py-2 text-sm font-semibold text-[#243446] disabled:opacity-70"
          >
            {loadingAction === 'warroom' ? 'Simulating...' : 'Launch 20-Agent War Room'}
          </button>
          <Link
            href={`/petitions/new?caseId=${props.caseData.id}`}
            className="rounded-xl border border-[#bfb7a1] bg-[#f8f5ea] px-3 py-2 text-sm font-semibold text-[#243446]"
          >
            Draft Petition
          </Link>
        </div>
        {error ? <p className="mt-2 text-sm font-medium text-red-600">{error}</p> : null}

        {props.latestStrategy ? (
          <div className="mt-4 rounded-xl border border-[#e1dccd] bg-[#fcfbf6] p-3">
            <p className="text-sm font-semibold text-[#243446]">Latest Strategy:</p>
            <p className="text-sm text-[#4e6074]">{props.latestStrategy.recommendedStrategy.primary.description}</p>
            <p className="mt-1 text-xs text-[#67778c]">
              Confidence {Math.round(props.latestStrategy.confidence * 100)}%
            </p>
            <Link
              href={`/strategy/${props.caseData.id}`}
              className="mt-2 inline-flex rounded-lg border border-[#c8c0ab] bg-white px-2 py-1 text-xs font-semibold"
            >
              Open Strategy Report
            </Link>
          </div>
        ) : null}

        {props.recentSession ? (
          <div className="mt-3 rounded-xl border border-[#e1dccd] bg-[#fcfbf6] p-3">
            <p className="text-sm font-semibold text-[#243446]">Latest War-Room Session:</p>
            <p className="text-sm text-[#4e6074]">{props.recentSession.sessionName}</p>
            <p className="mt-1 text-xs text-[#67778c]">
              {formatDate(props.recentSession.startedAt, { dateStyle: 'medium' })}
            </p>
            <Link
              href={`/war-room/${props.recentSession.id}`}
              className="mt-2 inline-flex rounded-lg border border-[#c8c0ab] bg-white px-2 py-1 text-xs font-semibold"
            >
              Review Session
            </Link>
          </div>
        ) : null}
      </SectionCard>

      <section className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Timeline">
          <form onSubmit={submitTimeline} className="space-y-2">
            <input name="eventDate" type="date" required />
            <select name="eventType" defaultValue="filing">
              <option value="filing">filing</option>
              <option value="hearing">hearing</option>
              <option value="order">order</option>
              <option value="adjournment">adjournment</option>
              <option value="evidence">evidence</option>
              <option value="argument">argument</option>
            </select>
            <input name="title" required placeholder="Event title" />
            <textarea name="description" rows={2} placeholder="Short details" />
            <button className="w-full rounded-lg bg-[#1e334a] px-3 py-2 text-sm font-semibold text-white">
              Add Event
            </button>
          </form>
          <div className="mt-3 space-y-2">
            {props.timeline.slice(0, 6).map((event) => (
              <div key={event.id} className="rounded-lg border border-[#e0dbc9] bg-[#fcfbf8] px-2 py-2 text-xs">
                <p className="font-semibold text-[#27374a]">{event.title}</p>
                <p className="text-[#647489]">
                  {event.eventDate} • {event.eventType}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Hearings">
          <form onSubmit={submitHearing} className="space-y-2">
            <input name="date" type="date" required />
            <input name="purpose" placeholder="Purpose" />
            <input name="court" placeholder="Courtroom / bench" />
            <button className="w-full rounded-lg bg-[#1e334a] px-3 py-2 text-sm font-semibold text-white">
              Add Hearing
            </button>
          </form>
          <div className="mt-3 space-y-2">
            {props.hearings.slice(0, 6).map((hearing) => (
              <div key={hearing.id} className="rounded-lg border border-[#e0dbc9] bg-[#fcfbf8] px-2 py-2 text-xs">
                <p className="font-semibold text-[#27374a]">{hearing.purpose || 'Hearing'}</p>
                <p className="text-[#647489]">
                  {hearing.date} {hearing.court ? `• ${hearing.court}` : ''} • {hearing.status}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Documents">
          <form onSubmit={submitDocument} className="space-y-2">
            <input name="title" required placeholder="Document title" />
            <select name="docType" defaultValue="memo">
              <option value="petition">petition</option>
              <option value="affidavit">affidavit</option>
              <option value="evidence">evidence</option>
              <option value="order">order</option>
              <option value="memo">memo</option>
            </select>
            <textarea name="content" rows={2} placeholder="Key notes or excerpt" />
            <button className="w-full rounded-lg bg-[#1e334a] px-3 py-2 text-sm font-semibold text-white">
              Add Document
            </button>
          </form>
          <div className="mt-3 space-y-2">
            {props.documents.slice(0, 6).map((doc) => (
              <div key={doc.id} className="rounded-lg border border-[#e0dbc9] bg-[#fcfbf8] px-2 py-2 text-xs">
                <p className="font-semibold text-[#27374a]">{doc.title}</p>
                <p className="text-[#647489]">
                  {doc.docType} • {formatDate(doc.createdAt, { dateStyle: 'medium' })}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>
    </div>
  );
}
