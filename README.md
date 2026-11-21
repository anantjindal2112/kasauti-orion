# Kasauti · कसौटी

**Brand truth, tested before it's published.**

Kasauti checks brand content (a post, an email, a banner) against the brand's approved rules and against proof that has an owner and an expiry date. Every finding names a real rule or proof entry, quotes the exact words from the draft, explains why, and suggests a fix. The AI only suggests; a person accepts, edits or disputes every fix.

Team Orion · CodeNova · InkLoom AI brand-governance brief. Live demo: <https://kasauti-ten.vercel.app/scan>

## What works today

- **Scan a draft:** paste copy, add up to 4 images, run a scan. Three ready examples open in one click (they replay a saved real NVIDIA run; change anything and the scan runs live).
- **Code checks (no AI):** brand and product names, banned words, price format, competitor mentions, link text, stacked `!!!`, ALL CAPS, emoji, pressure phrases, readability, alt text, hashtags.
- **Claim Ledger:** finds every price, offer, rating, count, certificate and superlative and marks it verified, stale, contradicted or no proof, against entries with an owner and an expiry date. Reviewers can add proof.
- **AI review with NVIDIA models**, then the **Verifier**: a finding is shown only if its rule exists, its quote is in the draft word for word, the quote contains what the rule is about, and its own explanation does not say the text is fine. Low confidence goes to a person.
- **Images:** NVIDIA vision reads text inside banners and the same checks run on it; missing alt text is flagged. A second vision pass reads the banner's text and background colours (contrast is then computed in code against WCAG AA, 4.5:1 for normal text and 3:1 for large) and which logo it shows (the retired v2 logo goes to a person).
- **Intent Lock:** fill in the Intent Card (purpose, audience, must-keep items) and every suggested fix is tested against it. Each fix shows what it **kept** and what it **changed**; a fix that loses a must-keep phrase, or lowers an offer without proof, is flagged for a person ("Accept anyway" is logged). Corrections the Claim Ledger proves are never blocked. "Accept all" holds flagged fixes back.
- **Fixes:** accept, edit or dispute each one, or "Accept all fixes" (rewrite, re-check, version history with restore).
- **Voice-over:** record in the browser, pick English or Hindi, and get text in English or Hindi (NVIDIA Parakeet speech-to-text, NVIDIA translation). Spoken prices and percentages become digits so the ledger can check them.
- **Suggest a phrase to read:** next to the record button. NVIDIA writes a short line from the brand's real facts (in English or Hindi), and our own rule checks must pass it (real product name, only numbers from the facts, no banned words or shouting) before it is shown, so what speech-to-text returns needs almost no fixing.
- **Live recording panel under the terminal:** the cassette, oscilloscope and equalizer show up right under the findings terminal while you record, where you can see them without scrolling, and go away when the recording ends.
- **Tidy text (English or Hindi):** one button under the copy box for typed or transcribed text. It fixes spacing, punctuation and capital letters (the Hindi full stop । for Hindi), and never changes a word: code tidies first, an NVIDIA model places sentence breaks better, and its version is used only if every word is identical. It is not the brand guidelines; the scan does that next. Undo is one click.
- **Hindi copy:** paste Hindi into the copy box and Kasauti offers to translate it to English with NVIDIA (spoken-number words become digits, brand names are kept) and review that. The Hindi stays restorable.
- **Insights (early Radar):** every accept, edit and dispute is logged in your browser; the Insights page ranks rules by how often people override them and marks a rule "unclear" at 3+ decisions and 25%+ overridden.
- **Sign-in, roles and a review workflow:** a shared database with four roles (creator, reviewer, manager, admin). Save a draft from the scanner, send it for review, comment, approve or request changes; nobody approves their own work. Every version is kept with a word-level diff, in-app notifications tell people what happened, and an **audit log** records every sign-in, save, status change, comment and decision. Demo accounts for every role are on the sign-in page. See [docs/workflow-and-database.md](docs/workflow-and-database.md).
- **Rulebook, Claim Ledger and Customise pages:** edit rules, proof and brand words; saved in the browser.
- **Working windows:** on the pages where it helps, the title-bar buttons are real. Minimize folds a window up to its title bar, maximize fills the screen (Esc or the button puts it back; so does a double-click on the title bar), and close tucks it into a one-line bar with a Reopen button. Nothing typed or recorded inside is lost.
- **Test set page:** 18 sample drafts with answer keys, scored live.
- **AI disclosure** on every scan: model, rules and proof used, masked items, every finding the Verifier dropped. If the AI is slow or down, the code checks still return results.

## What does not work yet

Plainly, see [docs/limitations.md](docs/limitations.md): rules, proof and the custom brand pack are still saved in your own browser (only submissions, comments, decisions and the audit log are shared), sign-in is a simple demo system, image review does not check the brand palette or logo clear space yet, the Insights Radar only sees this browser's decisions and does not yet draft sharper rules, and rule checks run on English text (Hindi is translated first).

What we plan next is in [docs/roadmap.md](docs/roadmap.md).

## How a scan works

`POST /api/scan` → `lib/pipeline/reviewDraft()`:

1. **Code checks** (`lib/checks/`): always run, no AI.
2. **Mask personal data** (`lib/privacy/mask.ts`): emails, phones, PAN, Aadhaar, cards, UPI and `[[marked]]` text never reach a model.
3. **Retrieve** (`lib/pipeline/retrieval.ts`): NVIDIA embeddings pick the closest rules and proof. If the embedding model is slow, the whole ledger is sent instead.
4. **AI review** (`lib/pipeline/ai-review.ts`): the reasoning and fast NVIDIA models are asked together; the first usable answer wins.
5. **Verifier** (`lib/pipeline/verifier.ts`): see above. Failing findings are dropped and listed in the disclosure.
6. **Claim Ledger** (`lib/ledger/`): code decides each claim's status from the proof entry; a model can only propose claims.

Intent Lock (`lib/pipeline/intent-lock.ts`): after the fixes are known, code checks what it can see (a must-keep phrase that disappears, an unproven lower discount) and a model judges the rest in one call; code overrules the model on ledger-proven corrections.

Hindi copy: `POST /api/translate` (Hindi to English) before the scan.

Voice: `POST /api/transcribe?from=en|hi&to=en|hi` → NVIDIA Parakeet (gRPC) → digits for spoken numbers → NVIDIA translation if the languages differ.

## NVIDIA models used

| Job | Model |
|---|---|
| Review, fixes | `nvidia/nemotron-3-ultra-550b-a55b` (reasoning), `nvidia/nemotron-3.5-lightning-30b-a3b` (fast) |
| Embeddings | `nvidia/nemotron-3.5-embed-8b` |
| Reading banners | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` |
| Safety check | `nvidia/llama-3.1-nemotron-safety-guard-8b-v3` |
| Speech-to-text | `nvidia/parakeet-1.1b-rnnt-multilingual-asr` |
| Translation | `nvidia/riva-translate-4b-instruct-v2` |

All AI calls go to NVIDIA. Model details and what we tried: [docs/nvidia-models.md](docs/nvidia-models.md).

## Measured during development

On our 18-draft test set (`testset/`), last full runs: code checks caught 26 of 26 issues they are responsible for with no false alarms; the full pipeline caught 32 of 32 text issues (6 only the AI found) and showed 2 findings outside the answer key; the ledger gave 17 of 17 expected statuses; retrieval found the right rule or proof for 10 of 10 test sentences. The AI part varies from run to run; re-run `npm run eval:ai` for today's numbers. 212 automated tests pass (`npm test`).

## Privacy

Personal details in text are masked before any AI call. Voice audio is not masked: pressing "Transcribe" sends the audio to NVIDIA's speech model. Recordings are kept only in the open browser tab.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in NVIDIA_API_KEY (more keys are used in rotation); for sign-in and review also DATABASE_URL and SESSION_SECRET
npx tsx scripts/db-migrate.mts && npx tsx scripts/db-seed.mts   # create the tables and demo accounts (needs DATABASE_URL)
npm run dev                  # http://localhost:3000
```

| Script | What it does |
|---|---|
| `npm run dev` / `build` | Dev server / production build |
| `npm test` | Unit tests |
| `npm run typecheck` / `lint` | TypeScript and ESLint |
| `npm run smoke:nvidia` | Live check of every NVIDIA model we use |
| `npm run eval:ai` | Live score of the full pipeline on the test set |
| `npm run eval:retrieval` / `eval:ledger` / `eval:code` | Live and offline scores for retrieval, ledger and code checks |
| `npx tsx scripts/record-showcase.mts <url>` | Re-record the saved example scans (needs `KASAUTI_RECORD=1` on the server) |

`GET /api/health` shows whether the app is up and whether the NVIDIA key is set (never the key).

## Folder layout

```
app/          pages and API routes (scan, fixall, transcribe, translate, auth, submissions, decisions, audit, health)
lib/nvidia/   NVIDIA clients: chat, embeddings, vision, safety, speech, translation
lib/checks/   code checks, no AI
lib/pipeline/ retrieval, AI review, Verifier, Intent Lock, image review, fix writer
lib/ledger/   Claim Ledger
lib/auth.ts, workflow.ts, db.ts   sign-in, roles and status rules, database access
lib/speech/   spoken numbers to digits, Hindi name spellings
lib/scan-fixtures/  saved real runs of the three examples
testset/      sample drafts with known errors
tests/        unit tests
docs/         limitations, roadmap, model notes
```

## Team

| Who | Owns |
|---|---|
| Anant Jindal | Team lead; AI and verification: prompts, the Verifier, Claim Ledger matching |
| Piyush Kataria | Backend and data: database, roles and security, versioning, audit log |
| Aakash | Frontend and experience: review screen, approval workflow, Insights board |
| Aman | Research, content and QA: demo brand pack, test set, documentation |

Roles are as planned in our Round 1 plan.
