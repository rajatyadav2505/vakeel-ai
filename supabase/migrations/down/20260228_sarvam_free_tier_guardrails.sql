do $$
begin
  if to_regclass('public.user_settings') is null then
    return;
  end if;

  update public.user_settings
  set
    llm_provider = 'openai',
    llm_model = 'gpt-4.1-mini',
    llm_base_url = null
  where
    llm_provider = 'sarvam'
    and llm_model = 'sarvam-m'
    and coalesce(llm_base_url, '') = 'https://api.sarvam.ai/v1'
    and coalesce(free_tier_only, true) = true;

  alter table public.user_settings
    alter column llm_provider set default 'openai';

  alter table public.user_settings
    alter column llm_model set default 'gpt-4.1-mini';

  alter table public.user_settings
    alter column llm_base_url drop default;

  alter table public.user_settings
    drop column if exists free_tier_only;
end $$;
