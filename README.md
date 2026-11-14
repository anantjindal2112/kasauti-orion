# Kasauti · कसौटी

**Brand truth, tested before it's published.**
A brand-governance verifier: every finding cites an approved source, every claim carries proof, and every fix keeps the creator's intent.

Team Orion · CodeNova · InkLoom AI brand-governance brief. The build plan is `STAGES.md` in the parent project folder.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Supabase: Postgres, Auth, row-level security, pgvector
- AI: **NVIDIA NIM endpoints only** (build.nvidia.com), via `lib/nvidia/`
- Zod for validating every AI response · Vitest for tests
- GitHub + Vercel

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in the keys
npm run dev                  # http://localhost:3000
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Unit tests (Vitest) |
| `npm run smoke:nvidia` | Live check of every NVIDIA model we use (needs `NVIDIA_API_KEY`) |
| `npm run eval:ai` | Live score of the full pipeline (code + NVIDIA AI + Verifier) on the test set |
| `npm run eval:retrieval` | Live check that retrieval finds the right rule/proof for 10 sentences |
| `npm run eval:code` | Score the code checks against the test-set answer keys (`-- -v` lists every miss/extra) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |

`GET /api/health` reports whether the app is up and which keys are configured (booleans only, never values).

## How a scan works

`POST /api/scan` → `lib/pipeline/reviewDraft()`:

1. **Code checks** (`lib/checks/`) — terms, prices, expiry dates, superlatives, punctuation, readability, accessibility. No AI; always runs.
2. **Mask PII** (`lib/privacy/mask.ts`) — emails, phones, PAN, Aadhaar, cards, UPI, `[[marked]]` text never reach a model.
3. **Retrieve** (`lib/pipeline/retrieval.ts`) — NVIDIA embeddings pick the closest rules and Claim Ledger entries for each sentence.
4. **AI review** (`lib/pipeline/ai-review.ts`) — an NVIDIA model judges what code can't (claim scope, vague green claims, offer conditions, tone) and returns JSON.
5. **Verifier** (`lib/pipeline/verifier.ts`) — every AI finding must cite a real rule/evidence code, quote the draft character for character, and offer a fix that passes the code checks and invents no prices. Fail → dropped. Low confidence, vague rule or broad quote → "needs human review".

If NVIDIA is slow or unavailable, step 1 still returns its findings.

## Folder layout

```
app/          pages + API routes
lib/nvidia/   NVIDIA model clients (chat, embed, rerank, pii, ocr, vision)
lib/checks/   code checks — no AI
lib/pipeline/ parser, retrieval, AI review, Verifier, Claim Ledger, Intent Lock
lib/db/       Supabase clients + queries
lib/schemas/  Zod schemas
supabase/     migrations + demo brand pack seed
testset/      sample drafts with known seeded errors
tests/        unit tests
docs/         architecture, limitations, roadmap
```
