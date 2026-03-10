drop table if exists public.consent_ledger;
drop table if exists public.case_documents;

alter table if exists public.cases
  drop constraint if exists cases_case_sensitivity_check;

alter table if exists public.cases
  drop column if exists case_sensitivity,
  drop column if exists evidence_extracted_at,
  drop column if exists evidence_graph_json;
