drop table if exists public.evidence_links;
drop table if exists public.authority_links;
drop table if exists public.judge_scores;
drop table if exists public.contradiction_targets;
drop table if exists public.policy_snapshots;
drop table if exists public.distillation_traces;
drop table if exists public.argument_nodes;
drop table if exists public.strategy_turns;
drop table if exists public.strategy_runs;

alter table if exists public.user_settings
  drop constraint if exists user_settings_kautilya_mode_check;

alter table if exists public.user_settings
  drop constraint if exists user_settings_kautilya_compute_check;

alter table if exists public.user_settings
  drop column if exists kautilya_ceres_compute_mode,
  drop column if exists kautilya_ceres_default_mode,
  drop column if exists kautilya_ceres_enabled;
