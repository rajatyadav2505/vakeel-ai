import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import type {
  ConflictAuthority,
  GroundedLegalClaim,
  LegalResearchPacket,
  StrategyOutput,
} from '@nyaya/shared';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getSimulationById } from '@/lib/queries';
import { formatPercent, toOutcomeBand } from '@/lib/utils';
import { PayoffMatrixChart } from '@/components/strategy/payoff-matrix-chart';
import { WinProbabilityGauge } from '@/components/strategy/win-probability-gauge';
import { WarRoomCanvas } from '@/components/war-room-canvas';
import { AgentThread } from '@/components/agent-thread';
import { LegalAuthorityPanels } from '@/components/authority/legal-authority-panels';

const CHANAKYA_COLORS: Record<string, string> = {
  saam: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  daam: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  dand: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  bhed: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
};

export default async function SimulationDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const simulation = await getSimulationById(params.id);
  if (!simulation) return notFound();

  const strategy = simulation.strategy_json as StrategyOutput;
  const outcomeBand = strategy?.winProbabilityBand ?? toOutcomeBand(simulation.win_probability ?? strategy?.winProbability ?? 0).toLowerCase();
  const legalResearchPacket = (strategy?.legalResearchPacket ?? null) as LegalResearchPacket | null;
  const groundedClaims = (strategy?.groundedLegalClaims ?? []) as GroundedLegalClaim[];
  const unverifiedClaims = (strategy?.unverifiedClaims ?? []) as GroundedLegalClaim[];
  const conflictingAuthorities = (strategy?.conflictingAuthorities ?? []) as ConflictAuthority[];
  const legalGroundingStatus = strategy?.legalGroundingStatus ?? 'incomplete';

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-[Georgia] text-xl font-semibold">{simulation.headline}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Confidence {formatPercent(simulation.confidence ?? 0)} \u2022 Outcome band {outcomeBand.toUpperCase()}
            </p>
          </div>
          <Badge>{simulation.mode}</Badge>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <PayoffMatrixChart matrix={strategy?.payOffMatrix ?? [[0, 0], [0, 0]]} />
        <WinProbabilityGauge
          value={simulation.win_probability ?? strategy?.winProbability ?? 0}
          band={outcomeBand as 'low' | 'medium' | 'high'}
        />
      </div>

      <Card>
        <h2 className="mb-3 font-[Georgia] text-base font-semibold">Strategic roadmap</h2>
        <div className="relative space-y-0">
          {(strategy?.rankedPlan ?? []).slice(0, 5).map((step, index, arr) => (
            <div key={step.step} className="relative flex gap-3 pb-4 last:pb-0">
              {/* Timeline connector */}
              <div className="flex flex-col items-center">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {step.step}
                </div>
                {index < arr.length - 1 && (
                  <div className="w-px flex-1 bg-border" />
                )}
              </div>
              {/* Step content */}
              <div className="min-w-0 flex-1 rounded-xl border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{step.recommendedCounterMove}</p>
                  <Badge className={CHANAKYA_COLORS[step.chanakyaTag] ?? ''}>
                    {step.chanakyaTag}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Opponent likely: {step.opponentLikelyMove}
                </p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.round(step.confidence * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {formatPercent(step.confidence)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <WarRoomCanvas proposals={strategy?.proposals ?? []} />
      <AgentThread proposals={strategy?.proposals ?? []} />

      <Card>
        <h2 className="mb-3 font-[Georgia] text-base font-semibold">Support classification</h2>
        <div className="space-y-2">
          {(strategy?.claims ?? []).slice(0, 10).map((claim) => (
            <div key={claim.id} className="rounded-xl border border-border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm">{claim.statement}</p>
                <Badge>{claim.supportClass}</Badge>
              </div>
              {claim.requiresHumanConfirmation && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                  Human confirmation required before filing or advice escalation.
                </p>
              )}
              {claim.anchors?.[0] && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Anchor: {claim.anchors[0].sourceName ?? claim.anchors[0].sourceType}
                  {typeof claim.anchors[0].page === 'number' ? ` p.${claim.anchors[0].page}` : ''} -{' '}
                  {claim.anchors[0].excerpt}
                </p>
              )}
            </div>
          ))}
          {(strategy?.claims ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              No classified claims available for this run.
            </p>
          )}
        </div>
      </Card>

      {(strategy?.citations ?? []).length > 0 && (
        <Card>
          <h2 className="mb-3 font-[Georgia] text-base font-semibold">Citations</h2>
          <div className="space-y-2">
            {(strategy?.citations ?? []).map((citation) => (
              <a
                key={citation.id}
                href={citation.url}
                target="_blank"
                rel="noreferrer"
                className="group flex items-start gap-2 rounded-xl border border-border bg-background p-3 hover:border-primary/20 hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium group-hover:text-primary">{citation.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{citation.excerpt}</p>
                </div>
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </a>
            ))}
          </div>
        </Card>
      )}

      <LegalAuthorityPanels
        legalResearchPacket={legalResearchPacket}
        groundedClaims={groundedClaims}
        unverifiedClaims={unverifiedClaims}
        conflicts={conflictingAuthorities}
        legalGroundingStatus={legalGroundingStatus}
      />
    </div>
  );
}
