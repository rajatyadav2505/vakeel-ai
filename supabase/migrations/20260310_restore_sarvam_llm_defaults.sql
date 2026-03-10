do $$
begin
  if to_regclass('public.user_settings') is null then
    return;
  end if;

  alter table public.user_settings
    alter column llm_provider set default 'sarvam';

  alter table public.user_settings
    alter column llm_model set default 'sarvam-m';

  alter table public.user_settings
    alter column llm_base_url set default 'https://api.sarvam.ai/v1';

  update public.user_settings
  set
    llm_provider = 'sarvam',
    llm_model = 'sarvam-m',
    llm_base_url = 'https://api.sarvam.ai/v1'
  where
    coalesce(llm_api_key, '') = ''
    and (
      (
        llm_provider = 'groq'
        and coalesce(llm_model, 'openai/gpt-oss-120b') = 'openai/gpt-oss-120b'
        and coalesce(llm_base_url, 'https://api.groq.com/openai/v1') = 'https://api.groq.com/openai/v1'
      )
      or (
        llm_provider = 'openai'
        and coalesce(llm_model, 'gpt-4.1-mini') = 'gpt-4.1-mini'
        and coalesce(llm_base_url, 'https://api.openai.com/v1') = 'https://api.openai.com/v1'
      )
    );
end $$;
