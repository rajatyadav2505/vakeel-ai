import Link from 'next/link';
import { FileQuestion, ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <Card className="flex flex-col items-center gap-4 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <FileQuestion className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <h1 className="font-[Georgia] text-xl font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The requested record or page does not exist.
        </p>
      </div>
      <Link href="/">
        <Button variant="outline">
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to dashboard
        </Button>
      </Link>
    </Card>
  );
}
