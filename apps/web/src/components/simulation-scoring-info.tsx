'use client';

import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function SimulationScoringInfo() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          How scoring works
        </Button>
      </DialogTrigger>
      <DialogContent>
        <h3 className="font-[Georgia] text-lg font-semibold">War-game scoring model</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Agent debate proposals are scored by payoff, risk, and citation support.</li>
          <li>Monte-Carlo branch simulations estimate expected utility under uncertainty.</li>
          <li>Chanakya overlays rank tactical fit: saam, daam, dand, bhed.</li>
          <li>Final confidence blends branch stability and authority quality.</li>
        </ul>
      </DialogContent>
    </Dialog>
  );
}
