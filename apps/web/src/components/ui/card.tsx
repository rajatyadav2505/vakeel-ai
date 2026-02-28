import { cn } from '@/lib/utils';

export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn('rounded-2xl border border-border bg-card/80 p-4 shadow-sm', props.className)}
    />
  );
}
