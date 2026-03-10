import React from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { buildPageHref } from '@/lib/pagination';

export function PaginationNav(props: {
  pathname: string;
  page: number;
  totalPages: number;
  query?: Record<string, string | number | undefined>;
}) {
  const canGoPrev = props.page > 1;
  const canGoNext = props.page < props.totalPages;
  const shared = props.query ? { query: props.query } : {};

  if (props.totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card/70 px-3 py-2">
      <Link
        aria-disabled={!canGoPrev}
        href={buildPageHref({
          pathname: props.pathname,
          page: Math.max(1, props.page - 1),
          ...shared,
        })}
        className={cn(
          buttonVariants({ size: 'sm', variant: 'outline' }),
          !canGoPrev && 'pointer-events-none opacity-60'
        )}
      >
        <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Previous
      </Link>
      <p className="text-xs text-muted-foreground">
        Page {props.page} of {props.totalPages}
      </p>
      <Link
        aria-disabled={!canGoNext}
        href={buildPageHref({
          pathname: props.pathname,
          page: Math.min(props.totalPages, props.page + 1),
          ...shared,
        })}
        className={cn(
          buttonVariants({ size: 'sm', variant: 'outline' }),
          !canGoNext && 'pointer-events-none opacity-60'
        )}
      >
        Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
