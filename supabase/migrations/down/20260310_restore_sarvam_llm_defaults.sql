do $$
begin
  if to_regclass('public.user_settings') is null then
    return;
  end if;

  alter table public.user_settings
    alter column llm_provider set default 'groq';

  alter table public.user_settings
    alter column llm_model set default 'openai/gpt-oss-120b';

  alter table public.user_settings
    alter column llm_base_url set default 'https://api.groq.com/openai/v1';

  update public.user_settings
  set
    llm_provider = 'groq',
    llm_model = 'openai/gpt-oss-120b',
    llm_base_url = 'https://api.groq.com/openai/v1'
  where
    coalesce(llm_api_key, '') = ''
    and llm_provider = 'sarvam'
    and coalesce(llm_model, 'sarvam-m') = 'sarvam-m'
    and coalesce(llm_base_url, 'https://api.sarvam.ai/v1') = 'https://api.sarvam.ai/v1';
end $$;
