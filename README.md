# Nyaya Mitra Command (Monorepo)

Production-oriented legal strategy platform for Indian advocates, law firms, and pro-se users.

## Monorepo Structure

```text
apps/
  web/                 # Next.js 15 app router app (React 19, TS strict)
packages/
  shared/              # Shared types, Zod schemas, Chanakya prompts, game theory utilities
  agents/              # LangGraph-compatible orchestration + tools + petition generator
supabase/
  migrations/          # Postgres + pgvector schema
  seed/                # Seed data
```

## Implemented Scope

- Auth + RBAC scaffolding with Clerk metadata (`ADVOCATE`, `JUNIOR`, `CLIENT`, `ADMIN`)
- Case intake with PDF + voice upload (Supabase Storage) using Server Actions
- Evidence Operating System pipeline:
  - strict upload validation (MIME/extension/signature + size caps)
  - parsed text extraction + OCR-needed detection
  - dual OCR fallback for scanned PDFs (Sarvam Document Intelligence + Google Gemini)
  - canonical evidence graph (facts, chronology, contradictions, missing docs, next-doc suggestions)
  - evidence-backed claim classification (`evidence` / `law` / `assumption`)
- Production legal grounding layer:
  - retrieval-first Indian legal research packet (`statutoryAuthorities`, `leadingPrecedents`, `latestPrecedents`)
  - authority ranking by relevance, hierarchy, forum/jurisdiction fit, recency
  - conflict detection and unresolved-issue marking
  - mandatory verified/unverified claim separation
- Phase 1 simulation: single-agent baseline
- Phase 2 simulation: multi-agent war-room (8–15 selected from 20 personas)
- Chanakya + game-theory scoring + Monte-Carlo branch scoring
- Indian Kanoon API integration example tool (`searchKanoon`)
- Petition generation with lawyer verification gate
- WhatsApp send + webhook handlers (Gupshup-ready)
- Supabase schema with pgvector + RLS + audit logs
- Global legal disclaimer + DPDP consent banner
- Tailwind + shadcn-style components + Radix dialog + Framer Motion + Recharts
- Tests: Vitest (web + agents, including Evidence OS/security parsers) + Playwright smoke suite

### Clerk Metadata Contract

Set these in Clerk public metadata/session claims:

```json
{
  "role": "ADVOCATE",
  "barCouncilId": "BCI-DEL-2026-001"
}
```

## Environment Variables

Create `.env.local` in `apps/web`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

INDIANKANOON_API_TOKEN=

UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

GUPSHUP_APP_NAME=
GUPSHUP_API_KEY=
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENROUTER_API_KEY=
GROQ_API_KEY=
CEREBRAS_API_KEY=
GITHUB_TOKEN=
DEEPSEEK_API_KEY=
SARVAM_API_KEY=
GEMINI_API_KEY=
GOOGLE_API_KEY=
ANTHROPIC_API_KEY=
OLLAMA_API_KEY=
INDIA_CODE_SEARCH_URL=
ECOURTS_JUDGMENTS_SEARCH_URL=
SUPREME_COURT_SEARCH_URL=
VERDICTUM_SEARCH_URL=
SCC_ONLINE_SEARCH_URL=
DATA_ENCRYPTION_KEY=

RESEND_API_KEY=
SENTRY_DSN=
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=
LANGCHAIN_PROJECT=nyaya-mitra
```

### Multi-provider Reasoning API Support

The app now supports these providers via **Settings > Service configuration** (`llmProvider`, `llmModel`, `llmBaseUrl`, `llmApiKey`):

- `sarvam`
- `openai`
- `google` (Gemini + OpenAI-compatible endpoint)
- `openrouter`
- `groq`
- `cerebras`
- `deepseek`
- `github` (GitHub Models / Azure inference endpoint)
- `anthropic`
- `ollama`

Defaults are auto-filled in settings for each provider. You can override model and base URL per user.

`freeTierOnly` is enabled by default and blocks potentially billable provider/model combinations. Out of the box, the project defaults to `sarvam-m` on Sarvam (`INR 0/token`) to keep runtime inference at zero cost.

### No-Cost Policy

- `freeTierOnly=true` is the default and enforced at runtime in the agent layer.
- Provider/model combinations outside approved free tiers are blocked before API calls.
- Voice transcription is **free-tier first**:
  - tries Sarvam STT first when `SARVAM_API_KEY` is present
  - OpenAI transcription fallback runs only when `freeTierOnly=false`
- PDF OCR is **dual-provider**:
  - tries Sarvam Document Intelligence first (or Google first if user LLM provider is Google)
  - falls back across Sarvam and Google Gemini OCR automatically

### Indian Legal Grounding

- All substantive legal analysis now runs retrieval before reasoning via `packages/agents/src/legal-research.ts`.
- Output is structured into:
  - `statutoryAuthorities`
  - `leadingPrecedents`
  - `latestPrecedents`
- Every run includes:
  - `precedentsCheckedAt`
  - `authorityCoverageScore`
  - `conflictsDetected`
  - explicit unverified legal-claim markers when authority is missing
- Strategy and simulation detail UI now shows inspectable authority panels with source links and metadata.

## Local Setup

1. Install dependencies
```bash
npm install
```

2. Run Supabase locally and apply migration
```bash
supabase start
supabase db reset --linked
```

3. Run web app
```bash
npm run dev --workspace=@nyaya/web
```

4. Run tests
```bash
npm run test --workspace=@nyaya/web
npm run agents:test
```

## Deployment

- Web/API: Vercel (`apps/web`)
- Database/Storage/pgvector: Supabase
- Agent workers (if Python nodes added): Railway/Render
- Redis queues: Upstash
- Observability: Vercel Analytics + Sentry + LangSmith

## Supabase Notes

- Primary schema is in [`supabase/migrations/20260227_init.sql`](/Users/rajatyadav/LegalPOC/supabase/migrations/20260227_init.sql)
- Seed script is in [`supabase/seed/seed.sql`](/Users/rajatyadav/LegalPOC/supabase/seed/seed.sql)
- `cases.search_embedding` is ready for pgvector-powered retrieval.

## Key Endpoints

- `POST /api/whatsapp/send` - send template/text updates to client
- `POST /api/whatsapp/webhook` - ingest inbound messages/docs
- `GET /api/kanoon/search?q=...` - legal citation lookup example
- `POST /api/ecourts/sync` - e-Courts sync queue stub

## Security/Compliance

- Mandatory lawyer verification checkbox before petition generation/export
- AI run audit logging (`ai_audit_logs`) storing prompt/response/confidence
- Input sanitization + rate limiting hooks
- DPDP consent + legal disclaimer shown globally

## Next Phase Extensions

- Live e-Courts adapters
- Hindi multilingual mode
- Full versioned lawyer review workflow
- Queue-backed async simulation workers
- Production WhatsApp interactive button templates
