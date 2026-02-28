do $$
begin
  if to_regclass('public.user_settings') is not null then
    alter table public.user_settings
      add column if not exists preferred_language text not null default 'en-IN';

    if not exists (
      select 1
      from pg_constraint
      where conname = 'user_settings_preferred_language_check'
    ) then
      alter table public.user_settings
        add constraint user_settings_preferred_language_check
        check (preferred_language in ('en-IN', 'hi-IN'));
    end if;

    update public.user_settings
    set preferred_language = coalesce(preferred_language, 'en-IN');
  end if;
end $$;

alter table public.petitions
  add column if not exists current_version integer not null default 1;

alter table public.petitions
  add column if not exists review_status text not null default 'draft';

alter table public.petitions
  add column if not exists review_notes text;

alter table public.petitions
  add column if not exists last_reviewed_by text;

alter table public.petitions
  add column if not exists last_reviewed_at timestamptz;

alter table public.petitions
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'petitions_review_status_check'
  ) then
    alter table public.petitions
      add constraint petitions_review_status_check
      check (review_status in ('draft', 'changes_requested', 'approved'));
  end if;
end $$;

create table if not exists public.petition_versions (
  id uuid primary key default gen_random_uuid(),
  petition_id uuid not null references public.petitions(id) on delete cascade,
  owner_user_id text not null,
  version integer not null,
  body text not null,
  change_summary text,
  review_action text not null default 'generated'
    check (review_action in ('generated', 'revision_saved', 'changes_requested', 'approved')),
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (petition_id, version)
);

create index if not exists petition_versions_petition_idx
  on public.petition_versions(petition_id, created_at desc);

create index if not exists petition_versions_owner_idx
  on public.petition_versions(owner_user_id, created_at desc);

create table if not exists public.simulation_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  case_id uuid not null references public.cases(id) on delete cascade,
  mode text not null check (mode in ('single_agent', 'multi_agent')),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  objective text not null,
  depth integer check (depth between 5 and 12),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  last_error text,
  result_simulation_id uuid references public.simulations(id) on delete set null,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists simulation_jobs_owner_idx
  on public.simulation_jobs(owner_user_id, created_at desc);

create index if not exists simulation_jobs_status_idx
  on public.simulation_jobs(status, queued_at asc);

create table if not exists public.ecourts_sync_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  case_id uuid references public.cases(id) on delete set null,
  cnr_number text not null,
  status text not null check (status in ('queued', 'synced', 'failed')),
  source text not null default 'ecourts',
  stage text,
  court_name text,
  next_hearing_date date,
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists ecourts_sync_events_owner_idx
  on public.ecourts_sync_events(owner_user_id, created_at desc);

create index if not exists ecourts_sync_events_case_idx
  on public.ecourts_sync_events(case_id, created_at desc);

alter table if exists public.petition_versions enable row level security;
alter table if exists public.simulation_jobs enable row level security;
alter table if exists public.ecourts_sync_events enable row level security;

drop policy if exists "petition_versions owner all" on public.petition_versions;
create policy "petition_versions owner all" on public.petition_versions
  using (owner_user_id = auth.jwt() ->> 'sub')
  with check (owner_user_id = auth.jwt() ->> 'sub');

drop policy if exists "simulation_jobs owner all" on public.simulation_jobs;
create policy "simulation_jobs owner all" on public.simulation_jobs
  using (owner_user_id = auth.jwt() ->> 'sub')
  with check (owner_user_id = auth.jwt() ->> 'sub');

drop policy if exists "ecourts_sync_events owner all" on public.ecourts_sync_events;
create policy "ecourts_sync_events owner all" on public.ecourts_sync_events
  using (owner_user_id = auth.jwt() ->> 'sub')
  with check (owner_user_id = auth.jwt() ->> 'sub');
