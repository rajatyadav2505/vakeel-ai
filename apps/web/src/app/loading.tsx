import { Card } from '@/components/ui/card';

export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-muted" />
            <div className="space-y-1.5">
              <div className="h-3 w-16 rounded bg-muted" />
              <div className="h-5 w-10 rounded bg-muted" />
            </div>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <div className="h-5 w-40 rounded bg-muted" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-muted" />
          ))}
        </Card>
        <Card className="space-y-3">
          <div className="h-5 w-40 rounded bg-muted" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-muted" />
          ))}
        </Card>
      </div>
    </div>
  );
}
