do $$
declare
  existing_constraint text;
begin
  if to_regclass('public.user_settings') is null then
    return;
  end if;

  select c.conname
  into existing_constraint
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'user_settings'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%llm_provider%';

  if existing_constraint is not null then
    execute format('alter table public.user_settings drop constraint %I', existing_constraint);
  end if;

  alter table public.user_settings
    add constraint user_settings_llm_provider_check
    check (
      llm_provider in (
        'openai',
        'anthropic',
        'google',
        'groq',
        'ollama',
        'openrouter',
        'cerebras',
        'github',
        'deepseek',
        'sarvam'
      )
    );
end $$;
