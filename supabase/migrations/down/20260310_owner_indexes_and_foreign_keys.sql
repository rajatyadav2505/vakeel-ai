drop index if exists public.strategy_turns_owner_idx;
drop index if exists public.argument_nodes_owner_idx;
drop index if exists public.evidence_links_owner_idx;
drop index if exists public.authority_links_owner_idx;
drop index if exists public.judge_scores_owner_idx;
drop index if exists public.contradiction_targets_owner_idx;
drop index if exists public.policy_snapshots_owner_idx;
drop index if exists public.distillation_traces_owner_idx;

alter table if exists public.strategy_turns
  drop constraint if exists strategy_turns_owner_user_id_fkey;

alter table if exists public.argument_nodes
  drop constraint if exists argument_nodes_owner_user_id_fkey;

alter table if exists public.evidence_links
  drop constraint if exists evidence_links_owner_user_id_fkey;

alter table if exists public.authority_links
  drop constraint if exists authority_links_owner_user_id_fkey;

alter table if exists public.judge_scores
  drop constraint if exists judge_scores_owner_user_id_fkey;

alter table if exists public.contradiction_targets
  drop constraint if exists contradiction_targets_owner_user_id_fkey;

alter table if exists public.policy_snapshots
  drop constraint if exists policy_snapshots_owner_user_id_fkey;

alter table if exists public.distillation_traces
  drop constraint if exists distillation_traces_owner_user_id_fkey;

alter table if exists public.strategy_runs
  drop constraint if exists strategy_runs_owner_user_id_fkey;

alter table if exists public.ecourts_sync_events
  drop constraint if exists ecourts_sync_events_owner_user_id_fkey;

alter table if exists public.simulation_jobs
  drop constraint if exists simulation_jobs_owner_user_id_fkey;

alter table if exists public.petition_versions
  drop constraint if exists petition_versions_owner_user_id_fkey;

alter table if exists public.consent_ledger
  drop constraint if exists consent_ledger_owner_user_id_fkey;

alter table if exists public.case_documents
  drop constraint if exists case_documents_owner_user_id_fkey;

alter table if exists public.user_settings
  drop constraint if exists user_settings_owner_user_id_fkey;

alter table if exists public.whatsapp_messages
  drop constraint if exists whatsapp_messages_owner_user_id_fkey;

alter table if exists public.ai_audit_logs
  drop constraint if exists ai_audit_logs_user_id_fkey;

alter table if exists public.petitions
  drop constraint if exists petitions_owner_user_id_fkey;

alter table if exists public.simulations
  drop constraint if exists simulations_owner_user_id_fkey;

alter table if exists public.cases
  drop constraint if exists cases_owner_user_id_fkey;

alter table if exists public.strategy_turns
  alter column confidence type numeric(4,3) using confidence::numeric(4,3);
