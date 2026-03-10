Apply rollback scripts in reverse chronological order from this directory.

Each file mirrors an `up` migration in `supabase/migrations/` and is intentionally idempotent where possible. Most rollbacks are destructive because the corresponding `up` migrations created new tables, columns, indexes, policies, or functions.

Recommended order:

1. `20260310_owner_indexes_and_foreign_keys.sql`
2. `20260310_claim_simulation_jobs.sql`
3. `20260307_kautilya_ceres.sql`
4. `20260228_sarvam_free_tier_guardrails.sql`
5. `20260228_phase2_roadmap_features.sql`
6. `20260228_llm_provider_matrix.sql`
7. `20260228_evidence_os.sql`
8. `20260228_enterprise_upgrade.sql`
9. `20260227_init.sql`
