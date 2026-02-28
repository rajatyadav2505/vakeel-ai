import { cn } from '@/lib/utils';

export function Badge(props: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...props}
      className={cn('inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium', props.className)}
    />
  );
}
