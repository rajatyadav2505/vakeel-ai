import { Card } from '@/components/ui/card';

export default function CasesLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-6 w-48 rounded bg-muted" />
        <div className="h-8 w-24 rounded-xl bg-muted" />
      </div>
      <div className="grid gap-3 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="space-y-2 p-3">
            <div className="h-3 w-16 rounded bg-muted" />
            <div className="h-12 rounded-lg bg-muted" />
            <div className="h-12 rounded-lg bg-muted" />
          </Card>
        ))}
      </div>
    </div>
  );
}
