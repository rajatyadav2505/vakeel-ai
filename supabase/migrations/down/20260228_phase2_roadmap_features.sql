drop table if exists public.petition_versions;
drop table if exists public.simulation_jobs;
drop table if exists public.ecourts_sync_events;

alter table if exists public.petitions
  drop constraint if exists petitions_review_status_check;

alter table if exists public.petitions
  drop column if exists updated_at,
  drop column if exists last_reviewed_at,
  drop column if exists last_reviewed_by,
  drop column if exists review_notes,
  drop column if exists review_status,
  drop column if exists current_version;

alter table if exists public.user_settings
  drop constraint if exists user_settings_preferred_language_check;

alter table if exists public.user_settings
  drop column if exists preferred_language;
