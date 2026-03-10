do $$
begin
  if to_regclass('public.user_settings') is not null then
    alter table public.user_settings
      add column if not exists kautilya_ceres_enabled boolean not null default true;

    alter table public.user_settings
      add column if not exists kautilya_ceres_default_mode text not null default 'robust_mode';

    alter table public.user_settings
      add column if not exists kautilya_ceres_compute_mode text not null default 'standard';

    if not exists (
      select 1 from pg_constraint where conname = 'user_settings_kautilya_mode_check'
    ) then
      alter table public.user_settings
        add constraint user_settings_kautilya_mode_check
        check (kautilya_ceres_default_mode in ('robust_mode', 'exploit_mode'));
    end if;

    if not exists (
      select 1 from pg_constraint where conname = 'user_settings_kautilya_compute_check'
    ) then
      alter table public.user_settings
        add constraint user_settings_kautilya_compute_check
        check (kautilya_ceres_compute_mode in ('fast', 'standard', 'full'));
    end if;
  end if;
end $$;

create table if not exists public.strategy_runs (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.simulations(id) on delete cascade,
  owner_user_id text not null,
  case_id uuid not null references public.cases(id) on delete cascade,
  engine_name text not null check (engine_name in ('KAUTILYA_CERES')),
  strategy_mode text not null check (strategy_mode in ('robust_mode', 'exploit_mode')),
  compute_mode text not null check (compute_mode in ('fast', 'standard', 'full')),
  objective text not null,
  aggregate_score numeric(5,3),
  appeal_survival_score numeric(5,3),
  disagreement_score numeric(5,3),
  output_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists strategy_runs_owner_idx
  on public.strategy_runs(owner_user_id, created_at desc);

create index if not exists strategy_runs_simulation_idx
  on public.strategy_runs(simulation_id);

create table if not exists public.strategy_turns (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.strategy_runs(id) on delete cascade,
  owner_user_id text not null,
  strategy_id text not null,
  role text not null,
  turn_index integer not null,
  phase text not null,
  tactic text not null,
  move_type text not null,
  target_issue_id text not null,
  claim text not null,
  expected_utility jsonb not null default '{}'::jsonb,
  confidence numeric(4,3),
  verifier_status text not null check (verifier_status in ('approved', 'abstained', 'rejected')),
  verifier_reasons jsonb not null default '[]'::jsonb,
  selected boolean not null default false,
  branch_score numeric(5,3),
  created_at timestamptz not null default now()
);

create index if not exists strategy_turns_run_idx
  on public.strategy_turns(run_id, strategy_id, turn_index);

create table if not exists public.argument_nodes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.strategy_runs(id) on delete cascade,
  owner_user_id text not null,
  node_id text not null,
  node_type text not null check (node_type in ('issue', 'evidence', 'authority', 'stakeholder', 'procedure_gate', 'uncertainty')),
  label text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists argument_nodes_run_idx
  on public.argument_nodes(run_id, node_type);

create table if not exists public.evidence_links (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.strategy_runs(id) on delete cascade,
  turn_id uuid not null references public.strategy_turns(id) on delete cascade,
  owner_user_id text not null,
  evidence_id text not null,
  excerpt text,
  weight numeric(5,3),
  created_at timestamptz not null default now()
);

create index if not exists evidence_links_turn_idx
  on public.evidence_links(turn_id);

create table if not exists public.authority_links (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.strategy_runs(id) on delete cascade,
  turn_id uuid not null references public.strategy_turns(id) on delete cascade,
  owner_user_id text not null,
  authority_id text not null,
  title text,
  weight numeric(5,3),
  created_at timestamptz not null default now()
);

create index if not exists authority_links_turn_idx
  on public.authority_links(turn_id);

create table if not exists public.judge_scores (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.strategy_runs(id) on delete cascade,
  owner_user_id text not null,
  strategy_id text not null,
  judge_role text not null,
  order_variant text not null check (order_variant in ('original', 'swapped')),
  legal_correctness numeric(5,3),
  citation_grounding numeric(5,3),
  procedural_compliance numeric(5,3),
  consistency numeric(5,3),
  fairness numeric(5,3),
  appeal_survival numeric(5,3),
  overall numeric(5,3),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists judge_scores_run_idx
  on public.judge_scores(run_id, strategy_id);

create table if not exists public.contradiction_targets (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.strategy_runs(id) on delete cascade,
  owner_user_id text not null,
  issue_id text not null,
  target_label text not null,
  supporting_evidence_ids jsonb not null default '[]'::jsonb,
  acceptance_score_drop numeric(5,3),
  min_cut_cost numeric(5,3),
  rationale text,
  created_at timestamptz not null default now()
);

create index if not exists contradiction_targets_run_idx
  on public.contradiction_targets(run_id);

create table if not exists public.policy_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.strategy_runs(id) on delete cascade,
  owner_user_id text not null,
  role text not null,
  bundle_id text not null,
  tactic text not null,
  evidence_ids jsonb not null default '[]'::jsonb,
  cumulative_regret numeric(5,3),
  strategy_probability numeric(5,3),
  created_at timestamptz not null default now()
);

create index if not exists policy_snapshots_run_idx
  on public.policy_snapshots(run_id, role);

create table if not exists public.distillation_traces (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.strategy_runs(id) on delete cascade,
  owner_user_id text not null,
  case_id uuid not null references public.cases(id) on delete cascade,
  quality_score numeric(5,3),
  approval_state text not null default 'candidate'
    check (approval_state in ('candidate', 'approved', 'rejected')),
  trace_json jsonb not null default '{}'::jsonb,
  training_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists distillation_traces_run_idx
  on public.distillation_traces(run_id, approval_state);

alter table if exists public.strategy_runs enable row level security;
alter table if exists public.strategy_turns enable row level security;
alter table if exists public.argument_nodes enable row level security;
alter table if exists public.evidence_links enable row level security;
alter table if exists public.authority_links enable row level security;
alter table if exists public.judge_scores enable row level security;
alter table if exists public.contradiction_targets enable row level security;
alter table if exists public.policy_snapshots enable row level security;
alter table if exists public.distillation_traces enable row level security;

drop policy if exists "strategy_runs owner all" on public.strategy_runs;
create policy "strategy_runs owner all" on public.strategy_runs
  using (owner_user_id = auth.jwt() ->> 'sub')
  with check (owner_user_id = auth.jwt() ->> 'sub');

drop policy if exists "strategy_turns owner all" on public.strategy_turns;
create policy "strategy_turns owner all" on public.strategy_turns
  using (owner_user_id = auth.jwt() ->> 'sub')
  with check (owner_user_id = auth.jwt() ->> 'sub');

drop policy if exists "argument_nodes owner all" on public.argument_nodes;
create policy "argument_nodes owner all" on public.argument_nodes
  using (owner_user_id = auth.jwt() ->> 'sub')
  with check (owner_user_id = auth.jwt() ->> 'sub');

drop policy if exists "evidence_links owner all" on public.evidence_links;
create policy "evidence_links owner all" on public.evidence_links
  using (owner_user_id = auth.jwt() ->> 'sub')
  with check (owner_user_id = auth.jwt() ->> 'sub');

drop policy if exists "authority_links owner all" on public.authority_links;
create policy "authority_links owner all" on public.authority_links
  using (owner_user_id = auth.jwt() ->> 'sub')
  with check (owner_user_id = auth.jwt() ->> 'sub');

drop policy if exists "judge_scores owner all" on public.judge_scores;
create policy "judge_scores owner all" on public.judge_scores
  using (owner_user_id = auth.jwt() ->> 'sub')
  with check (owner_user_id = auth.jwt() ->> 'sub');

drop policy if exists "contradiction_targets owner all" on public.contradiction_targets;
create policy "contradiction_targets owner all" on public.contradiction_targets
  using (owner_user_id = auth.jwt() ->> 'sub')
  with check (owner_user_id = auth.jwt() ->> 'sub');

drop policy if exists "policy_snapshots owner all" on public.policy_snapshots;
create policy "policy_snapshots owner all" on public.policy_snapshots
  using (owner_user_id = auth.jwt() ->> 'sub')
  with check (owner_user_id = auth.jwt() ->> 'sub');

drop policy if exists "distillation_traces owner all" on public.distillation_traces;
create policy "distillation_traces owner all" on public.distillation_traces
  using (owner_user_id = auth.jwt() ->> 'sub')
  with check (owner_user_id = auth.jwt() ->> 'sub');
