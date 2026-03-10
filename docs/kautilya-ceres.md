# KAUTILYA_CERES

KAUTILYA_CERES is the evidence-grounded litigation strategy engine integrated into Nyaya Mitra's case, simulation, and drafting flows.

Its full name is **Kautilyan Counterfactual Evidence Regret with Equilibrium Search**.

## What It Adds

- Structured multi-agent litigation search instead of single-pass prose generation
- Typed, phase-aware moves before any drafting output
- Evidence, authority, contradiction, procedure, and timeline verification
- Judge-panel scoring with appeal-survival pressure
- Counterfactual Evidence Regret updates over evidence+tactic bundles
- Persisted strategy runs as event logs suitable for review and distillation

## Runtime Architecture

The runtime lives primarily in:

- `packages/agents/src/kautilya-ceres.ts`
- `packages/agents/src/kautilya-ceres-graph.ts`
- `packages/agents/src/kautilya-ceres-verifiers.ts`
- `packages/agents/src/kautilya-ceres-fracture.ts`
- `packages/agents/src/kautilya-ceres-judge.ts`
- `packages/agents/src/kautilya-ceres-regret.ts`
- `packages/agents/src/distillation.ts`

The web integration lives in:

- `apps/web/src/app/actions/simulations.ts`
- `apps/web/src/lib/simulation-worker.ts`
- `apps/web/src/lib/strategy-run-persistence.ts`
- `apps/web/src/components/kautilya/kautilya-strategy-view.tsx`
- `apps/web/src/app/simulations/[id]/page.tsx`
- `apps/web/src/app/petitions/new/page.tsx`

## Engine Flow

1. Case materials are compiled into a case graph.
2. Candidate structured moves are generated for each side.
3. The verifier stack rejects unsupported moves.
4. BHEDA fracture search finds top contradiction targets in the opponent narrative.
5. Beam/MCTS-style local search scores move sequences.
6. A judge panel scores the surviving sequences.
7. Counterfactual Evidence Regret updates mixed policy weights over evidence+tactic bundles.
8. The top strategies are rendered into strategy cards, judge-order forecasts, settlement ladders, appeal-risk maps, and IRAC-ready blocks.
9. Approved or candidate traces are persisted for later distillation.

## Case Representation

Each run compiles a `KautilyaCaseGraph` with:

- issue graph
- evidence graph
- authority graph
- procedural gates
- stakeholder mandala graph
- history log
- uncertainty map

Every strategy move is emitted first as typed JSON with:

- `role`
- `phase`
- `tactic`
- `move_type`
- `target_issue_id`
- `claim`
- `evidence_ids`
- `authority_ids`
- `expected_utility`
- `confidence`

Only verified moves are promoted into downstream strategy cards and drafting content.

## Tactics

The engine mixes among four lawful tactics:

- `SAMA`: persuasion, credibility, coherence
- `DANA`: calibrated concession and settlement leverage
- `BHEDA`: contradiction exposure and narrative fracture
- `DANDA`: lawful procedural pressure and urgency

The selected mix depends on phase, issue status, evidence coverage, and inferred opponent profile.

## Verifier Stack

The verifier stack currently includes:

- evidence existence verification
- authority existence verification
- claim-evidence grounding checks
- timeline consistency checks
- contradiction checks
- procedure gate checks
- support-span readiness flags for downstream traceability

Moves that fail support or procedure checks are rejected or abstained before scoring.

## Judge Panel

The judge panel includes:

- merits judge
- procedure judge
- citation judge
- appellate reviewer
- neutrality auditor

Scoring uses anonymized party framing and aggregate statistics instead of a single judge output.

The aggregate score tracks:

- overall score
- grounding
- procedure
- citation quality
- fairness
- disagreement index

## Search Modes

Two strategy modes are exposed in the UI and server actions:

- `robust_mode`: optimize against a plausible opponent set
- `exploit_mode`: optimize against the inferred opponent profile

Three compute presets are available:

- `fast`
- `standard`
- `full`

If judge disagreement or grounding uncertainty is high, the engine escalates depth and rollout pressure.

## Persistence

Migration: `supabase/migrations/20260307_kautilya_ceres.sql`

This migration adds:

- user setting flags for KAUTILYA_CERES
- `strategy_runs`
- `strategy_turns`
- `argument_nodes`
- `evidence_links`
- `authority_links`
- `judge_scores`
- `contradiction_targets`
- `policy_snapshots`
- `distillation_traces`

Runs are stored as event logs rather than one opaque blob, so later review, analytics, and training export remain possible.

## Product Integration

The engine is wired into existing product flows:

- case page strategy form can select `legacy` or `KAUTILYA_CERES`
- simulation detail page renders the Kautilya strategy board when present
- selected strategies can be pushed into petition drafting via `simulationId` and `strategyId`
- the demo page runs a synthetic fixture through the new engine

Each Kautilya strategy board shows:

- top petitioner strategies
- top respondent best responses
- judge panel breakdown
- likely judge order
- contradiction fracture points
- missing evidence checklist
- settlement ladder
- appeal-risk map
- evidence traceability
- authority traceability

## Feature Flags And Settings

The new engine is controlled through `user_settings`:

- `kautilya_ceres_enabled`
- `kautilya_ceres_default_mode`
- `kautilya_ceres_compute_mode`

These are exposed in the settings UI and enforced in the simulation action before job enqueue.

## Open-Weight Model Routing

KAUTILYA_CERES reuses the existing model configuration path rather than introducing a second provider abstraction.

For local or self-hosted open-weight models, use the existing settings fields:

- `llmProvider`
- `llmModel`
- `llmBaseUrl`
- `llmApiKey`

Practical options:

- `ollama` for local inference
- OpenAI-compatible endpoints behind `llmBaseUrl` for vLLM or similar routers

The model is treated as a move generator inside the verifier and search stack, not as the final source of truth.

## Distillation Pipeline

The distillation entrypoints currently live in `packages/agents/src/distillation.ts`.

Implemented utilities:

- `buildKautilyaDistillationTrace`
- `selectDistillationDataset`
- `toRoleTokenizedSftExample`
- `exportDistillationJsonl`
- `agentWiseNormalizeRewards`

The current trace policy keeps high-quality runs with pressure on:

- grounding score
- unsupported-claim rate
- reversal risk
- inter-judge agreement

This supports a two-step training workflow:

1. export approved/candidate traces into JSONL SFT examples
2. train a shared model with role tokens or downstream role adapters

## Local Development

1. Install dependencies.
2. Apply Supabase migrations, including `20260307_kautilya_ceres.sql`.
3. Configure model settings in the app.
4. Run the web app.
5. Open a case and launch a simulation with `KAUTILYA_CERES`.

Useful commands:

```bash
npm run test --workspace=@nyaya/agents
npm run test --workspace=@nyaya/web
npm run build --workspace=@nyaya/web
```

## Fixture And Tests

The synthetic fixture case used for engine validation lives in:

- `packages/agents/src/kautilya-ceres.fixture.ts`

Coverage includes:

- graph compiler tests
- verifier tests
- fracture search tests
- CER update tests
- judge aggregation tests
- full engine integration test
- unsupported-citation regression coverage
- strategy-view rendering coverage through the web test suite
