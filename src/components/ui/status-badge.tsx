import { cn, statusColor } from '@/lib/utils';

export function StatusBadge(props: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize',
        statusColor(props.status),
        props.className
      )}
    >
      {props.status.replace(/_/g, ' ')}
    </span>
  );
}
