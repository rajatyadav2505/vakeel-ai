'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';

interface WarRoomCanvasProps {
  proposals: Array<{
    id: string;
    agentId: string;
    move: string;
    rationale: string;
  }>;
}

export function WarRoomCanvas(props: WarRoomCanvasProps) {
  return (
    <Card className="overflow-hidden">
      <p className="mb-3 text-sm font-semibold">Interactive war-room canvas</p>
      <div className="grid gap-3 md:grid-cols-2">
        {props.proposals.slice(0, 8).map((proposal, index) => (
          <motion.div
            key={proposal.id}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: index * 0.05 }}
            className="rounded-xl border border-border bg-background p-3"
          >
            <div className="mb-1 flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {proposal.agentId.slice(0, 2).toUpperCase()}
              </span>
              <p className="text-sm font-semibold">{proposal.move}</p>
            </div>
            <p className="text-xs text-muted-foreground">{proposal.rationale}</p>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}
