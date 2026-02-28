'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { LEGAL_DISCLAIMER, DPDP_CONSENT_TEXT } from '@nyaya/shared';

export function DisclaimerBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1 space-y-0.5 text-xs">
          <p className="font-semibold">{LEGAL_DISCLAIMER}</p>
          <p className="text-amber-800 dark:text-amber-200">{DPDP_CONSENT_TEXT}</p>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-md p-1 hover:bg-amber-200/50 dark:hover:bg-amber-800/30"
          aria-label="Dismiss disclaimer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
