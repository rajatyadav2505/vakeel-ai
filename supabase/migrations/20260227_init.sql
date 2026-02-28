create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique not null,
  role text not null check (role in ('ADVOCATE','JUNIOR','CLIENT','ADMIN')),
  full_name text,
  phone text,
  bar_council_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.cases (
  id uuid primary key,
  owner_user_id text not null,
  title text not null,
  cnr_number text,
  case_type text not null check (case_type in ('civil','criminal','constitutional','family','labor','consumer','tax')),
  stage text not null default 'intake' check (stage in ('intake','analysis','filing','hearing','closed')),
  court_name text,
  summary text not null,
  summary_encrypted text,
  client_name text,
  opponent_name text,
  jurisdiction text,
  intake_pdf_path text,
  intake_voice_path text,
  voice_transcript text,
  lawyer_verified_for_export boolean not null default false,
  search_embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.simulations (
  id uuid primary key,
  owner_user_id text not null,
  case_id uuid not null references public.cases(id) on delete cascade,
  mode text not null check (mode in ('single_agent','multi_agent')),
  headline text not null,
  confidence numeric(4,3),
  win_probability numeric(4,3),
  strategy_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.petitions (
  id uuid primary key,
  owner_user_id text not null,
  case_id uuid not null references public.cases(id) on delete cascade,
  petition_type text not null,
  court_template text not null,
  body text not null,
  confidence numeric(4,3),
  citations_json jsonb not null default '[]'::jsonb,
  lawyer_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_audit_logs (
  id uuid primary key,
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id text not null,
  run_type text not null check (run_type in ('single_agent','multi_agent','petition')),
  prompt text not null,
  response text not null,
  confidence numeric(4,3),
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_messages (
  id uuid primary key,
  sender_phone text not null,
  body text not null,
  message_id text unique not null,
  media_url text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.legal_corpus (
  id text primary key,
  source text not null check (source in ('indiankanoon','bare_act','internal')),
  title text not null,
  content text not null,
  citation_url text,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index if not exists cases_owner_idx on public.cases(owner_user_id);
create index if not exists simulations_case_idx on public.simulations(case_id);
create index if not exists petitions_case_idx on public.petitions(case_id);
create index if not exists cases_embedding_idx on public.cases using ivfflat (search_embedding vector_cosine_ops) with (lists = 100);
create index if not exists legal_corpus_embedding_idx on public.legal_corpus using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table public.profiles enable row level security;
alter table public.cases enable row level security;
alter table public.simulations enable row level security;
alter table public.petitions enable row level security;
alter table public.ai_audit_logs enable row level security;

create policy "profiles owner read" on public.profiles
  for select using (clerk_user_id = auth.jwt() ->> 'sub');

create policy "cases owner all" on public.cases
  using (owner_user_id = auth.jwt() ->> 'sub')
  with check (owner_user_id = auth.jwt() ->> 'sub');

create policy "simulations owner all" on public.simulations
  using (owner_user_id = auth.jwt() ->> 'sub')
  with check (owner_user_id = auth.jwt() ->> 'sub');

create policy "petitions owner all" on public.petitions
  using (owner_user_id = auth.jwt() ->> 'sub')
  with check (owner_user_id = auth.jwt() ->> 'sub');

create policy "audit owner all" on public.ai_audit_logs
  using (user_id = auth.jwt() ->> 'sub')
  with check (user_id = auth.jwt() ->> 'sub');
