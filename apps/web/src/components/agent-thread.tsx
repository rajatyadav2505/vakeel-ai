'use client';

import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';

export function AgentThread(props: {
  proposals: Array<{ id: string; agentId: string; rationale: string }>;
}) {
  return (
    <Card>
      <p className="mb-3 text-sm font-semibold">Agent discussion thread</p>
      <div className="space-y-2">
        {props.proposals.slice(0, 12).map((proposal, index) => (
          <motion.div
            key={proposal.id}
            initial={{ opacity: 0, x: index % 2 === 0 ? -10 : 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.03 }}
            className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm ${
              index % 2 === 0
                ? 'mr-auto bg-primary/10 text-primary'
                : 'ml-auto bg-muted text-foreground'
            }`}
          >
            <p className="text-xs font-semibold uppercase">{proposal.agentId}</p>
            <p>{proposal.rationale}</p>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}
