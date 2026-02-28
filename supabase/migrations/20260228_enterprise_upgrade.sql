create table if not exists public.user_settings (
  owner_user_id text primary key,
  llm_provider text not null default 'openai' check (llm_provider in ('openai','anthropic','google','groq','ollama')),
  llm_model text not null default 'gpt-4.1-mini',
  llm_api_key text,
  llm_base_url text,
  notifications_enabled boolean not null default true,
  realtime_updates_enabled boolean not null default true,
  default_page_size integer not null default 12 check (default_page_size between 5 and 50),
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_settings_owner_idx on public.user_settings(owner_user_id);

alter table if exists public.user_settings enable row level security;

drop policy if exists "user_settings owner all" on public.user_settings;
create policy "user_settings owner all" on public.user_settings
  using (owner_user_id = auth.jwt() ->> 'sub')
  with check (owner_user_id = auth.jwt() ->> 'sub');

alter table public.whatsapp_messages add column if not exists owner_user_id text;
alter table public.whatsapp_messages add column if not exists contact_phone text;
alter table public.whatsapp_messages add column if not exists direction text not null default 'inbound'
  check (direction in ('inbound','outbound'));
alter table public.whatsapp_messages add column if not exists delivery_status text not null default 'received'
  check (delivery_status in ('received','queued','sent','delivered','failed'));

update public.whatsapp_messages
set contact_phone = sender_phone
where contact_phone is null;

create index if not exists whatsapp_messages_owner_idx on public.whatsapp_messages(owner_user_id);
create index if not exists whatsapp_messages_contact_idx on public.whatsapp_messages(contact_phone, created_at desc);
