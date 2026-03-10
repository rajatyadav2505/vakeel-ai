import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { WinProbabilityGauge } from '@/components/strategy/win-probability-gauge';
import { PayoffMatrixChart } from '@/components/strategy/payoff-matrix-chart';
import { WarRoomCanvas } from '@/components/war-room-canvas';
import { AgentThread } from '@/components/agent-thread';
import { KautilyaStrategyView } from '@/components/kautilya/kautilya-strategy-view';
import { KAUTILYA_CERES_FIXTURE_CASE, runKautilyaCeresWarGame } from '@nyaya/agents';

export default async function DemoPage() {
  const sample = await runKautilyaCeresWarGame({
    caseId: KAUTILYA_CERES_FIXTURE_CASE.caseId,
    summary: KAUTILYA_CERES_FIXTURE_CASE.summary,
    objective: KAUTILYA_CERES_FIXTURE_CASE.objective,
    forum: KAUTILYA_CERES_FIXTURE_CASE.forum,
    jurisdiction: KAUTILYA_CERES_FIXTURE_CASE.jurisdiction,
    voiceTranscript: KAUTILYA_CERES_FIXTURE_CASE.voiceTranscript,
    documents: KAUTILYA_CERES_FIXTURE_CASE.documents,
    strategyMode: 'robust_mode',
    computeMode: 'standard',
  });

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
          <span className="font-semibold">{KAUTILYA_CERES_FIXTURE_CASE.title}</span> • fixture • analysis
        </p>
        <p className="text-sm text-muted-foreground">{KAUTILYA_CERES_FIXTURE_CASE.objective}</p>
        <Link href="/" className="text-sm text-primary hover:underline">
          Open main app
        </Link>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <PayoffMatrixChart matrix={sample.payOffMatrix} />
        <WinProbabilityGauge value={sample.winProbability} />
      </div>

      <WarRoomCanvas proposals={sample.proposals} />
      <AgentThread proposals={sample.proposals} />
      {sample.kautilyaCeres && (
        <KautilyaStrategyView
          caseId={KAUTILYA_CERES_FIXTURE_CASE.caseId}
          simulationId="demo-simulation"
          engine={sample.kautilyaCeres}
        />
      )}
    </div>
  );
}
