create or replace function public.claim_simulation_jobs(job_limit integer default 3)
returns setof public.simulation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_limit integer := greatest(1, least(coalesce(job_limit, 3), 10));
begin
  return query
  with next_jobs as (
    select id
    from public.simulation_jobs
    where status = 'queued'
    order by queued_at asc
    for update skip locked
    limit safe_limit
  ), claimed as (
    update public.simulation_jobs jobs
    set status = 'processing',
        attempts = jobs.attempts + 1,
        started_at = now(),
        finished_at = null,
        last_error = null,
        updated_at = now()
    from next_jobs
    where jobs.id = next_jobs.id
    returning jobs.*
  )
  select *
  from claimed
  order by queued_at asc;
end;
$$;
