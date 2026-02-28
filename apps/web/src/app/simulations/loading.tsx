import { Card } from '@/components/ui/card';

export default function SimulationsLoading() {
  return (
    <Card className="space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-6 w-48 rounded bg-muted" />
        <div className="h-8 w-32 rounded-xl bg-muted" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-muted" />
        ))}
      </div>
    </Card>
  );
}
