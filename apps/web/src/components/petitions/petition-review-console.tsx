'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface PetitionVersion {
  id: string;
  version: number;
  body: string;
  change_summary: string | null;
  review_action: string;
  created_at: string;
  created_by: string;
}

interface PetitionRecord {
  id: string;
  petition_type: string;
  court_template: string;
  case_id: string;
  body: string;
  confidence: number | null;
  lawyer_verified: boolean;
  review_status: string;
  current_version: number;
  review_notes: string | null;
  last_reviewed_at: string | null;
}

function formatDate(value: string | null) {
  if (!value) return 'Not reviewed yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not reviewed yet' : date.toLocaleString();
}

export function PetitionReviewConsole(props: {
  petition: PetitionRecord;
  versions: PetitionVersion[];
}) {
  const [body, setBody] = useState(props.petition.body);
  const [notes, setNotes] = useState(props.petition.review_notes ?? '');
  const [lawyerVerified, setLawyerVerified] = useState(props.petition.lawyer_verified);
  const [status, setStatus] = useState('Ready');
  const [saving, setSaving] = useState(false);

  const latestVersion = useMemo(
    () => Math.max(props.petition.current_version, ...(props.versions ?? []).map((item) => item.version)),
    [props.petition.current_version, props.versions]
  );

  async function applyReviewAction(action: 'save_revision' | 'request_changes' | 'approve') {
    setSaving(true);
    setStatus('Saving...');
    const response = await fetch(`/api/petitions/${props.petition.id}/review`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        body,
        notes,
        lawyerVerified,
      }),
    });

    const payload = (await response.json()) as {
      ok?: boolean;
      error?: string;
      version?: number;
      reviewAction?: string;
    };
    if (!response.ok || !payload.ok) {
      setStatus(payload.error ?? 'Failed to update petition review state.');
      setSaving(false);
      return;
    }

    setStatus(
      `Saved action "${payload.reviewAction ?? action}" at version v${payload.version ?? latestVersion + 1}. Refresh page to view latest history.`
    );
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{props.petition.review_status.replace('_', ' ')}</Badge>
          <Badge>v{latestVersion}</Badge>
          <Badge>{props.petition.court_template.replace('_', ' ')}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Last reviewed: {formatDate(props.petition.last_reviewed_at)}
        </p>
      </Card>

      <Card className="space-y-3">
        <Label>
          Petition body (editable for versioned revisions)
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={18} />
        </Label>

        <Label>
          Review notes
          <Input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Add review summary / change request notes"
          />
        </Label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={lawyerVerified}
            onChange={(event) => setLawyerVerified(event.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          Lawyer verification confirmed
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={() => void applyReviewAction('save_revision')}>
            Save Revision
          </Button>
          <Button type="button" variant="outline" disabled={saving} onClick={() => void applyReviewAction('request_changes')}>
            Request Changes
          </Button>
          <Button type="button" disabled={saving} onClick={() => void applyReviewAction('approve')}>
            Approve
          </Button>
          <p className="text-xs text-muted-foreground">{status}</p>
        </div>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-[Georgia] text-base font-semibold">Version history</h2>
        <div className="space-y-2">
          {(props.versions ?? []).map((version) => (
            <div key={version.id} className="rounded-xl border border-border bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  v{version.version} • {version.review_action.replace('_', ' ')}
                </p>
                <p className="text-xs text-muted-foreground">{new Date(version.created_at).toLocaleString()}</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{version.change_summary ?? 'No summary provided.'}</p>
            </div>
          ))}
          {props.versions.length === 0 && (
            <p className="text-sm text-muted-foreground">No version snapshots available yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
