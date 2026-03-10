'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { KautilyaCeresOutput, StrategyMode } from '@nyaya/shared';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function toneForSeverity(severity: 'low' | 'medium' | 'high') {
  if (severity === 'high') return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
  if (severity === 'medium') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
}

export function KautilyaStrategyView(props: {
  simulationId?: string;
  caseId: string;
  engine: KautilyaCeresOutput;
}) {
  const [mode, setMode] = useState<StrategyMode>(props.engine.requestedMode);
  const caseGraph = props.engine.caseGraph;
  const petitionerStrategies = props.engine.petitionerStrategies[mode] ?? [];
  const respondentStrategies = props.engine.respondentStrategies[mode] ?? [];
  const focusStrategy = petitionerStrategies[0] ?? respondentStrategies[0] ?? null;

  const linkedEvidence = useMemo(() => {
    if (!focusStrategy) return [];
    return focusStrategy.citedEvidenceIds
      .map((id) => caseGraph.evidenceGraph.find((node) => node.id === id))
      .filter(
        (
          node
        ): node is (typeof caseGraph.evidenceGraph)[number] => Boolean(node)
      );
  }, [caseGraph, focusStrategy]);

  const linkedAuthorities = useMemo(() => {
    if (!focusStrategy) return [];
    return focusStrategy.citedAuthorityIds
      .map((id) => caseGraph.authorityGraph.find((node) => node.id === id))
      .filter(
        (
          node
        ): node is (typeof caseGraph.authorityGraph)[number] => Boolean(node)
      );
  }, [caseGraph, focusStrategy]);

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-[Georgia] text-base font-semibold">KAUTILYA_CERES board</h2>
            <p className="text-xs text-muted-foreground">
              Typed moves, verifier stack, judge panel, fracture search, and regret-matched tactics.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-border p-1">
              <button
                type="button"
                onClick={() => setMode('robust_mode')}
                className={cn(
                  'rounded-full px-3 py-1 text-xs',
                  mode === 'robust_mode' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                )}
              >
                Robust
              </button>
              <button
                type="button"
                onClick={() => setMode('exploit_mode')}
                className={cn(
                  'rounded-full px-3 py-1 text-xs',
                  mode === 'exploit_mode' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                )}
              >
                Exploit
              </button>
            </div>
            <div className="inline-flex rounded-full border border-border p-1">
              {(['fast', 'standard', 'full'] as const).map((compute) => (
                <span
                  key={compute}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs',
                    props.engine.computeMode === compute
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground'
                  )}
                >
                  {compute}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-[Georgia] text-base font-semibold">Petitioner strategies</h3>
            <Badge>{mode.replace('_', ' ')}</Badge>
          </div>
          {petitionerStrategies.map((strategy, index) => (
            <div key={strategy.id} className="rounded-xl border border-border bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{strategy.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{strategy.summary}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>Score {Math.round(strategy.expectedValue * 100)}%</p>
                  <p>Appeal {Math.round(strategy.appealSurvival * 100)}%</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge>{strategy.structuredMoves[0]?.tactic ?? 'SAMA'}</Badge>
                <Badge>{strategy.citedEvidenceIds.length} evidence</Badge>
                <Badge>{strategy.citedAuthorityIds.length} authorities</Badge>
                <Badge>#{index + 1}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/petitions/new?caseId=${props.caseId}&simulationId=${props.simulationId ?? ''}&strategyId=${strategy.id}`}
                >
                  <Button size="sm">Push to Petition</Button>
                </Link>
              </div>
            </div>
          ))}
          {petitionerStrategies.length === 0 && (
            <p className="text-sm text-muted-foreground">No petitioner strategies were generated.</p>
          )}
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-[Georgia] text-base font-semibold">Respondent best responses</h3>
            <Badge>{mode.replace('_', ' ')}</Badge>
          </div>
          {respondentStrategies.map((strategy, index) => (
            <div key={strategy.id} className="rounded-xl border border-border bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{strategy.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{strategy.summary}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>Score {Math.round(strategy.expectedValue * 100)}%</p>
                  <p>Appeal {Math.round(strategy.appealSurvival * 100)}%</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge>{strategy.structuredMoves[0]?.tactic ?? 'SAMA'}</Badge>
                <Badge>{strategy.citedEvidenceIds.length} evidence</Badge>
                <Badge>{strategy.citedAuthorityIds.length} authorities</Badge>
                <Badge>#{index + 1}</Badge>
              </div>
            </div>
          ))}
          {respondentStrategies.length === 0 && (
            <p className="text-sm text-muted-foreground">No respondent responses were generated.</p>
          )}
        </Card>
      </div>

      {focusStrategy && (
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-[Georgia] text-base font-semibold">Judge panel breakdown</h3>
              <Badge>{focusStrategy.role.replace(/_/g, ' ')}</Badge>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {focusStrategy.judgeAggregate.scores.map((score) => (
                <div key={`${score.judgeRole}-${score.orderVariant}`} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase">{score.judgeRole.replace(/_/g, ' ')}</p>
                    <Badge>{score.orderVariant}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{score.notes}</p>
                  <div className="mt-2 space-y-1 text-xs">
                    <p>Merits {Math.round(score.legalCorrectness * 100)}%</p>
                    <p>Procedure {Math.round(score.proceduralCompliance * 100)}%</p>
                    <p>Citations {Math.round(score.citationGrounding * 100)}%</p>
                    <p>Appeal {Math.round(score.appealSurvival * 100)}%</p>
                    <p>Overall {Math.round(score.overall * 100)}%</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-border bg-background p-3 text-xs text-muted-foreground">
              Aggregate {Math.round(focusStrategy.judgeAggregate.aggregateOverall * 100)}% •
              disagreement {Math.round(focusStrategy.judgeAggregate.disagreementIndex * 100)}% •
              order-swap delta {Math.round(focusStrategy.judgeAggregate.orderSwapDelta * 100)}%
            </div>
          </Card>

          <Card className="space-y-3">
            <h3 className="font-[Georgia] text-base font-semibold">Likely judge-panel order</h3>
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="flex items-center gap-2">
                <Badge>{props.engine.likelyJudgeOrder.prevailingSide.replace(/_/g, ' ')}</Badge>
                <p className="text-sm font-semibold">{props.engine.likelyJudgeOrder.summary}</p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {props.engine.likelyJudgeOrder.proceduralNote}
              </p>
              <div className="mt-2 space-y-1">
                {props.engine.likelyJudgeOrder.reasoning.map((item) => (
                  <p key={item} className="text-xs text-muted-foreground">
                    • {item}
                  </p>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Appeal risk map</p>
              <div className="mt-2 space-y-2">
                {props.engine.appealRiskMap.slice(0, 4).map((risk) => (
                  <div key={risk.id} className="rounded-lg border border-border p-2">
                    <div className="flex items-center gap-2">
                      <Badge className={toneForSeverity(risk.severity)}>{risk.severity}</Badge>
                      <p className="text-xs font-medium">{risk.risk}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{risk.mitigation}</p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="space-y-3">
          <h3 className="font-[Georgia] text-base font-semibold">Contradiction map</h3>
          <div className="space-y-2">
            {props.engine.contradictionTargets.map((target) => (
              <div key={target.id} className="rounded-xl border border-border bg-background p-3">
                <p className="text-sm font-medium">{target.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{target.rationale}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge>drop {Math.round(target.acceptanceScoreDrop * 100)}%</Badge>
                  <Badge>cost {Math.round(target.minCutCost * 100)}%</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="space-y-3">
          <h3 className="font-[Georgia] text-base font-semibold">Missing evidence checklist</h3>
          <div className="space-y-2">
            {props.engine.missingEvidenceChecklist.map((item) => (
              <div key={item.id} className="rounded-xl border border-border bg-background p-3">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
                <Badge className="mt-2">{item.requiredDocumentType}</Badge>
              </div>
            ))}
            {props.engine.missingEvidenceChecklist.length === 0 && (
              <p className="text-sm text-muted-foreground">No obvious missing-document blockers were detected.</p>
            )}
          </div>
        </Card>

        <Card className="space-y-3">
          <h3 className="font-[Georgia] text-base font-semibold">Settlement ladder</h3>
          <div className="space-y-2">
            {props.engine.settlementLadder.map((item) => (
              <div key={item.id} className="rounded-xl border border-border bg-background p-3">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.concession}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{item.trigger}</p>
                <Badge className="mt-2">value {Math.round(item.settlementValue * 100)}%</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="space-y-3">
          <h3 className="font-[Georgia] text-base font-semibold">Evidence traceability</h3>
          <div className="space-y-2">
            {linkedEvidence.map((node) => (
              <div key={node.id} className="rounded-xl border border-border bg-background p-3">
                <p className="text-sm font-medium">{node.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{node.excerpt}</p>
              </div>
            ))}
            {linkedEvidence.length === 0 && (
              <p className="text-sm text-muted-foreground">No linked evidence on the focus strategy.</p>
            )}
          </div>
        </Card>

        <Card className="space-y-3">
          <h3 className="font-[Georgia] text-base font-semibold">Authority traceability</h3>
          <div className="space-y-2">
            {linkedAuthorities.map((node) => (
              <a
                key={node.id}
                href={node.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl border border-border bg-background p-3 hover:border-primary/20 hover:bg-muted/50"
              >
                <p className="text-sm font-medium">{node.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{node.proposition}</p>
              </a>
            ))}
            {linkedAuthorities.length === 0 && (
              <p className="text-sm text-muted-foreground">No linked authorities on the focus strategy.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
