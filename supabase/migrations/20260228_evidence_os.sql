do $$
begin
  if to_regclass('public.cases') is not null then
    alter table public.cases
      add column if not exists evidence_graph_json jsonb not null default '{}'::jsonb;

    alter table public.cases
      add column if not exists evidence_extracted_at timestamptz;

    alter table public.cases
      add column if not exists case_sensitivity text not null default 'standard';

    if not exists (
      select 1
      from pg_constraint
      where conname = 'cases_case_sensitivity_check'
    ) then
      alter table public.cases
        add constraint cases_case_sensitivity_check
        check (case_sensitivity in ('standard', 'sensitive', 'privileged'));
    end if;
  end if;
end $$;

create table if not exists public.case_documents (
  id uuid primary key,
  case_id uuid not null references public.cases(id) on delete cascade,
  owner_user_id text not null,
  file_name text not null,
  file_path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text not null,
  document_type text not null check (
    document_type in (
      'unknown',
      'petition',
      'affidavit',
      'notice',
      'order',
      'agreement',
      'postal_proof',
      'receipt',
      'annexure',
      'evidence',
      'audio_note'
    )
  ),
  parser_status text not null default 'pending' check (parser_status in ('pending', 'processing', 'completed', 'failed')),
  parsed_text text,
  parsed_json jsonb not null default '{}'::jsonb,
  is_privileged boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists case_documents_case_idx on public.case_documents(case_id, created_at desc);
create index if not exists case_documents_owner_idx on public.case_documents(owner_user_id, created_at desc);
create index if not exists case_documents_type_idx on public.case_documents(document_type);

alter table if exists public.case_documents enable row level security;
drop policy if exists "case_documents owner all" on public.case_documents;
create policy "case_documents owner all" on public.case_documents
  using (owner_user_id = auth.jwt() ->> 'sub')
  with check (owner_user_id = auth.jwt() ->> 'sub');

create table if not exists public.consent_ledger (
  id uuid primary key,
  owner_user_id text not null,
  case_id uuid references public.cases(id) on delete cascade,
  consent_type text not null,
  purpose text not null,
  accepted boolean not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists consent_ledger_owner_idx on public.consent_ledger(owner_user_id, created_at desc);
create index if not exists consent_ledger_case_idx on public.consent_ledger(case_id, created_at desc);

alter table if exists public.consent_ledger enable row level security;
drop policy if exists "consent_ledger owner all" on public.consent_ledger;
create policy "consent_ledger owner all" on public.consent_ledger
  using (owner_user_id = auth.jwt() ->> 'sub')
  with check (owner_user_id = auth.jwt() ->> 'sub');

