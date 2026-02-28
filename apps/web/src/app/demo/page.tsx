import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WinProbabilityGauge } from '@/components/strategy/win-probability-gauge';
import { PayoffMatrixChart } from '@/components/strategy/payoff-matrix-chart';
import { WarRoomCanvas } from '@/components/war-room-canvas';
import { AgentThread } from '@/components/agent-thread';

const sample = {
  title: 'Agarwal v. State Utility Board',
  stage: 'analysis',
  caseType: 'constitutional',
  objective: 'Secure interim stay and force document disclosure in 3 hearings.',
  matrix: [
    [6, 2],
    [8, 4],
  ],
  winProbability: 0.74,
  proposals: [
    {
      id: '1',
      agentId: 'p3',
      move: 'Precedent cluster filing',
      rationale: 'File compact precedent map to neutralize maintainability objections on day 1.',
    },
    {
      id: '2',
      agentId: 'p15',
      move: 'Interim pressure motion',
      rationale: 'Seek urgent interim order with timeline control and cost-backed adjournment conditions.',
    },
    {
      id: '3',
      agentId: 'p16',
      move: 'Contradiction strike',
      rationale: 'Exploit departmental affidavit inconsistency across annexures and hearing submissions.',
    },
    {
      id: '4',
      agentId: 'p17',
      move: 'Payoff-optimized sequence',
      rationale: 'Sequence hearings to maximize expected utility under opponent-defect probability of 0.62.',
    },
  ],
};

export default function DemoPage() {
  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-[Georgia] text-2xl font-semibold">Live UI Sample</h1>
          <Badge>demo</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          This is a static preview of the war-room dashboard style with sample legal data.
        </p>
        <p className="text-sm">
          <span className="font-semibold">{sample.title}</span> • {sample.caseType} • {sample.stage}
        </p>
        <p className="text-sm text-muted-foreground">{sample.objective}</p>
        <Link href="/" className="text-sm text-primary hover:underline">
          Open main app
        </Link>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <PayoffMatrixChart matrix={sample.matrix} />
        <WinProbabilityGauge value={sample.winProbability} />
      </div>

      <WarRoomCanvas proposals={sample.proposals} />
      <AgentThread proposals={sample.proposals} />
    </div>
  );
}
