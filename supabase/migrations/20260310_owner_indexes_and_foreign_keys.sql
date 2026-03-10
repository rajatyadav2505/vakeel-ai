create index if not exists strategy_turns_owner_idx
  on public.strategy_turns(owner_user_id, created_at desc);

create index if not exists argument_nodes_owner_idx
  on public.argument_nodes(owner_user_id, created_at desc);

create index if not exists evidence_links_owner_idx
  on public.evidence_links(owner_user_id, created_at desc);

create index if not exists authority_links_owner_idx
  on public.authority_links(owner_user_id, created_at desc);

create index if not exists judge_scores_owner_idx
  on public.judge_scores(owner_user_id, created_at desc);

create index if not exists contradiction_targets_owner_idx
  on public.contradiction_targets(owner_user_id, created_at desc);

create index if not exists policy_snapshots_owner_idx
  on public.policy_snapshots(owner_user_id, created_at desc);

create index if not exists distillation_traces_owner_idx
  on public.distillation_traces(owner_user_id, created_at desc);

alter table public.strategy_turns
  alter column confidence type numeric(5,3) using confidence::numeric(5,3);

do $$
begin
  if to_regclass('public.profiles') is null then
    return;
  end if;

  if to_regclass('public.cases') is not null and not exists (
    select 1 from pg_constraint where conname = 'cases_owner_user_id_fkey'
  ) then
    alter table public.cases
      add constraint cases_owner_user_id_fkey
      foreign key (owner_user_id) references public.profiles(clerk_user_id)
      on update cascade on delete cascade not valid;
  end if;

  if to_regclass('public.simulations') is not null and not exists (
    select 1 from pg_constraint where conname = 'simulations_owner_user_id_fkey'
  ) then
    alter table public.simulations
      add constraint simulations_owner_user_id_fkey
      foreign key (owner_user_id) references public.profiles(clerk_user_id)
      on update cascade on delete cascade not valid;
  end if;

  if to_regclass('public.petitions') is not null and not exists (
    select 1 from pg_constraint where conname = 'petitions_owner_user_id_fkey'
  ) then
    alter table public.petitions
      add constraint petitions_owner_user_id_fkey
      foreign key (owner_user_id) references public.profiles(clerk_user_id)
      on update cascade on delete cascade not valid;
  end if;

  if to_regclass('public.ai_audit_logs') is not null and not exists (
    select 1 from pg_constraint where conname = 'ai_audit_logs_user_id_fkey'
  ) then
    alter table public.ai_audit_logs
      add constraint ai_audit_logs_user_id_fkey
      foreign key (user_id) references public.profiles(clerk_user_id)
      on update cascade on delete cascade not valid;
  end if;

  if to_regclass('public.whatsapp_messages') is not null and not exists (
    select 1 from pg_constraint where conname = 'whatsapp_messages_owner_user_id_fkey'
  ) then
    alter table public.whatsapp_messages
      add constraint whatsapp_messages_owner_user_id_fkey
      foreign key (owner_user_id) references public.profiles(clerk_user_id)
      on update cascade on delete cascade not valid;
  end if;

  if to_regclass('public.user_settings') is not null and not exists (
    select 1 from pg_constraint where conname = 'user_settings_owner_user_id_fkey'
  ) then
    alter table public.user_settings
      add constraint user_settings_owner_user_id_fkey
      foreign key (owner_user_id) references public.profiles(clerk_user_id)
      on update cascade on delete cascade not valid;
  end if;

  if to_regclass('public.case_documents') is not null and not exists (
    select 1 from pg_constraint where conname = 'case_documents_owner_user_id_fkey'
  ) then
    alter table public.case_documents
      add constraint case_documents_owner_user_id_fkey
      foreign key (owner_user_id) references public.profiles(clerk_user_id)
      on update cascade on delete cascade not valid;
  end if;

  if to_regclass('public.consent_ledger') is not null and not exists (
    select 1 from pg_constraint where conname = 'consent_ledger_owner_user_id_fkey'
  ) then
    alter table public.consent_ledger
      add constraint consent_ledger_owner_user_id_fkey
      foreign key (owner_user_id) references public.profiles(clerk_user_id)
      on update cascade on delete cascade not valid;
  end if;

  if to_regclass('public.petition_versions') is not null and not exists (
    select 1 from pg_constraint where conname = 'petition_versions_owner_user_id_fkey'
  ) then
    alter table public.petition_versions
      add constraint petition_versions_owner_user_id_fkey
      foreign key (owner_user_id) references public.profiles(clerk_user_id)
      on update cascade on delete cascade not valid;
  end if;

  if to_regclass('public.simulation_jobs') is not null and not exists (
    select 1 from pg_constraint where conname = 'simulation_jobs_owner_user_id_fkey'
  ) then
    alter table public.simulation_jobs
      add constraint simulation_jobs_owner_user_id_fkey
      foreign key (owner_user_id) references public.profiles(clerk_user_id)
      on update cascade on delete cascade not valid;
  end if;

  if to_regclass('public.ecourts_sync_events') is not null and not exists (
    select 1 from pg_constraint where conname = 'ecourts_sync_events_owner_user_id_fkey'
  ) then
    alter table public.ecourts_sync_events
      add constraint ecourts_sync_events_owner_user_id_fkey
      foreign key (owner_user_id) references public.profiles(clerk_user_id)
      on update cascade on delete cascade not valid;
  end if;

  if to_regclass('public.strategy_runs') is not null and not exists (
    select 1 from pg_constraint where conname = 'strategy_runs_owner_user_id_fkey'
  ) then
    alter table public.strategy_runs
      add constraint strategy_runs_owner_user_id_fkey
      foreign key (owner_user_id) references public.profiles(clerk_user_id)
      on update cascade on delete cascade not valid;
  end if;

  if to_regclass('public.strategy_turns') is not null and not exists (
    select 1 from pg_constraint where conname = 'strategy_turns_owner_user_id_fkey'
  ) then
    alter table public.strategy_turns
      add constraint strategy_turns_owner_user_id_fkey
      foreign key (owner_user_id) references public.profiles(clerk_user_id)
      on update cascade on delete cascade not valid;
  end if;

  if to_regclass('public.argument_nodes') is not null and not exists (
    select 1 from pg_constraint where conname = 'argument_nodes_owner_user_id_fkey'
  ) then
    alter table public.argument_nodes
      add constraint argument_nodes_owner_user_id_fkey
      foreign key (owner_user_id) references public.profiles(clerk_user_id)
      on update cascade on delete cascade not valid;
  end if;

  if to_regclass('public.evidence_links') is not null and not exists (
    select 1 from pg_constraint where conname = 'evidence_links_owner_user_id_fkey'
  ) then
    alter table public.evidence_links
      add constraint evidence_links_owner_user_id_fkey
      foreign key (owner_user_id) references public.profiles(clerk_user_id)
      on update cascade on delete cascade not valid;
  end if;

  if to_regclass('public.authority_links') is not null and not exists (
    select 1 from pg_constraint where conname = 'authority_links_owner_user_id_fkey'
  ) then
    alter table public.authority_links
      add constraint authority_links_owner_user_id_fkey
      foreign key (owner_user_id) references public.profiles(clerk_user_id)
      on update cascade on delete cascade not valid;
  end if;

  if to_regclass('public.judge_scores') is not null and not exists (
    select 1 from pg_constraint where conname = 'judge_scores_owner_user_id_fkey'
  ) then
    alter table public.judge_scores
      add constraint judge_scores_owner_user_id_fkey
      foreign key (owner_user_id) references public.profiles(clerk_user_id)
      on update cascade on delete cascade not valid;
  end if;

  if to_regclass('public.contradiction_targets') is not null and not exists (
    select 1 from pg_constraint where conname = 'contradiction_targets_owner_user_id_fkey'
  ) then
    alter table public.contradiction_targets
      add constraint contradiction_targets_owner_user_id_fkey
      foreign key (owner_user_id) references public.profiles(clerk_user_id)
      on update cascade on delete cascade not valid;
  end if;

  if to_regclass('public.policy_snapshots') is not null and not exists (
    select 1 from pg_constraint where conname = 'policy_snapshots_owner_user_id_fkey'
  ) then
    alter table public.policy_snapshots
      add constraint policy_snapshots_owner_user_id_fkey
      foreign key (owner_user_id) references public.profiles(clerk_user_id)
      on update cascade on delete cascade not valid;
  end if;

  if to_regclass('public.distillation_traces') is not null and not exists (
    select 1 from pg_constraint where conname = 'distillation_traces_owner_user_id_fkey'
  ) then
    alter table public.distillation_traces
      add constraint distillation_traces_owner_user_id_fkey
      foreign key (owner_user_id) references public.profiles(clerk_user_id)
      on update cascade on delete cascade not valid;
  end if;
end $$;
