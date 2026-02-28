do $$
begin
  if to_regclass('public.user_settings') is null then
    return;
  end if;

  alter table public.user_settings
    add column if not exists free_tier_only boolean not null default true;

  alter table public.user_settings
    alter column llm_provider set default 'sarvam';

  alter table public.user_settings
    alter column llm_model set default 'sarvam-m';

  alter table public.user_settings
    alter column llm_base_url set default 'https://api.sarvam.ai/v1';

  alter table public.user_settings
    alter column free_tier_only set default true;

  update public.user_settings
  set free_tier_only = coalesce(free_tier_only, true);

  update public.user_settings
  set
    llm_provider = 'sarvam',
    llm_model = 'sarvam-m',
    llm_base_url = 'https://api.sarvam.ai/v1'
  where
    llm_provider = 'openai'
    and llm_model = 'gpt-4.1-mini'
    and coalesce(llm_base_url, '') in ('', 'https://api.openai.com/v1');
end $$;
