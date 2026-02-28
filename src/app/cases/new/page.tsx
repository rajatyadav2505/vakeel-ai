'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SectionCard } from '@/components/ui/section-card';

const CASE_TYPES = ['civil', 'criminal', 'constitutional', 'family', 'labor', 'consumer', 'tax'] as const;

export default function NewCasePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    const formData = new FormData(event.currentTarget);
    const payload = {
      title: String(formData.get('title') ?? ''),
      caseNumber: String(formData.get('caseNumber') ?? ''),
      caseType: String(formData.get('caseType') ?? ''),
      court: String(formData.get('court') ?? ''),
      judge: String(formData.get('judge') ?? ''),
      clientName: String(formData.get('clientName') ?? ''),
      opponentName: String(formData.get('opponentName') ?? ''),
      opponentAdvocate: String(formData.get('opponentAdvocate') ?? ''),
      filingDate: String(formData.get('filingDate') ?? ''),
      nextHearing: String(formData.get('nextHearing') ?? ''),
      description: String(formData.get('description') ?? ''),
      notes: String(formData.get('notes') ?? ''),
    };

    const response = await fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? 'Failed to create case');
      return;
    }

    const created = (await response.json()) as { id: string };
    router.push(`/cases/${created.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-[Georgia] text-2xl font-semibold text-[#1e2a39]">Add New Case</h1>
        <p className="text-sm text-[#607086]">Capture matter details for strategy, petitioning, and tracking.</p>
      </div>

      <SectionCard title="Case Intake Form">
        <form className="grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
          <label className="text-sm font-medium text-[#334458] md:col-span-2">
            Case title
            <input name="title" required placeholder="e.g. Sharma v. State of Maharashtra" />
          </label>

          <label className="text-sm font-medium text-[#334458]">
            Case number
            <input name="caseNumber" placeholder="e.g. WP/1234/2026" />
          </label>

          <label className="text-sm font-medium text-[#334458]">
            Case type
            <select name="caseType" defaultValue="civil" required>
              {CASE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-[#334458]">
            Court
            <input name="court" placeholder="e.g. Delhi High Court" />
          </label>

          <label className="text-sm font-medium text-[#334458]">
            Judge
            <input name="judge" placeholder="If assigned" />
          </label>

          <label className="text-sm font-medium text-[#334458]">
            Client name
            <input name="clientName" placeholder="Client / petitioner" />
          </label>

          <label className="text-sm font-medium text-[#334458]">
            Opponent name
            <input name="opponentName" placeholder="Respondent / defendant" />
          </label>

          <label className="text-sm font-medium text-[#334458]">
            Opponent advocate
            <input name="opponentAdvocate" placeholder="If known" />
          </label>

          <label className="text-sm font-medium text-[#334458]">
            Filing date
            <input name="filingDate" type="date" />
          </label>

          <label className="text-sm font-medium text-[#334458]">
            Next hearing
            <input name="nextHearing" type="date" />
          </label>

          <label className="text-sm font-medium text-[#334458] md:col-span-2">
            Matter brief
            <textarea
              name="description"
              rows={4}
              placeholder="Facts, key issues, and relief sought."
            />
          </label>

          <label className="text-sm font-medium text-[#334458] md:col-span-2">
            Internal notes
            <textarea name="notes" rows={3} placeholder="Client constraints, evidence gaps, urgency flags." />
          </label>

          {error ? <p className="text-sm font-medium text-red-600 md:col-span-2">{error}</p> : null}

          <div className="flex gap-2 md:col-span-2">
            <button
              disabled={submitting}
              className="rounded-xl bg-[#1e334a] px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
            >
              {submitting ? 'Creating...' : 'Create Case'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/cases')}
              className="rounded-xl border border-[#bcb49f] px-4 py-2 text-sm font-semibold text-[#243446]"
            >
              Cancel
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
