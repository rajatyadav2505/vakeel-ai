do $$
begin
  if to_regclass('public.user_settings') is null then
    return;
  end if;

  update public.user_settings
  set
    llm_provider = 'sarvam',
    llm_model = 'sarvam-m',
    llm_base_url = 'https://api.sarvam.ai/v1'
  where
    coalesce(llm_api_key, '') = ''
    and llm_provider = 'groq'
    and coalesce(llm_model, 'openai/gpt-oss-120b') = 'openai/gpt-oss-120b'
    and coalesce(llm_base_url, 'https://api.groq.com/openai/v1') = 'https://api.groq.com/openai/v1';

  alter table public.user_settings
    alter column llm_provider set default 'sarvam';

  alter table public.user_settings
    alter column llm_model set default 'sarvam-m';

  alter table public.user_settings
    alter column llm_base_url set default 'https://api.sarvam.ai/v1';
end $$;
