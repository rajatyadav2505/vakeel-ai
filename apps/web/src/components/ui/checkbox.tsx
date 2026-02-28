'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Checkbox(props: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  name?: string;
}) {
  return (
    <button
      type="button"
      id={props.id}
      onClick={() => props.onCheckedChange(!props.checked)}
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border',
        props.checked ? 'bg-primary text-primary-foreground' : 'bg-background'
      )}
      role="checkbox"
      aria-checked={props.checked}
    >
      {props.checked ? <Check className="h-3 w-3" /> : null}
      {props.name && <input type="hidden" name={props.name} value={props.checked ? 'on' : ''} />}
    </button>
  );
}
