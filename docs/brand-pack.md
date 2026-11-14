# Demo brand pack — Dhaaga & Co. (fictional)

Kasauti's demo runs against one **fictional** brand: **Dhaaga & Co.**, an Indian D2C brand selling handwoven cotton bedsheets, towels and cushion covers. Any resemblance to a real company is accidental.

All expiry logic in tests and the demo uses `DEMO_TODAY = 2026-11-13` (`lib/brand-pack.ts`), so seeded "stale" and "valid" entries stay that way whenever the demo runs.

## Files — `supabase/seed/brand-pack/`

| File | What it holds |
|---|---|
| `brand.json` | Name, products, audience, voice do/don't, limits (grade 8, 1 "!", 2 emoji) |
| `rules.json` | 27 rules, `KSR-<layer>.<n>` |
| `evidence.json` | 16 Claim Ledger entries, `KLE-xx`, with source, owner, verified and expiry dates |
| `terms.json` | Brand/product name variants, banned words, replacements, competitors, acronyms, superlatives, claim candidates, absolute claims, pressure phrases |
| `assets.json` | Logos (v3 current, v2 retired), 6-colour palette, fonts, contrast thresholds |
| `logos/` | `logo-v3.svg` (current), `logo-v2-retired.svg` |

Schemas: `lib/schemas/brand-pack.ts`. Loader: `loadBrandPack()` in `lib/brand-pack.ts`.

### Rule layers

| Prefix | Layer | Examples |
|---|---|---|
| KSR-1.x | Voice | 1.2 *Keep the tone warm* (deliberately vague), 1.3 at most one "!" |
| KSR-2.x | Terminology | 2.1 brand name, 2.5 ₹ format, 2.6 *Use approved names* |
| KSR-3.x | Visual | 3.1 *Logo needs clear space* (deliberately vague), 3.2 current logo, 3.4 WCAG contrast |
| KSR-4.x | Claims | 4.1 prices match ledger, 4.2 *Claims need evidence*, 4.3 certifications, 4.4 no absolutes |
| KSR-5.x | Accessibility | 5.1 alt text, 5.2 link text, 5.3 CamelCase hashtags |
| KSR-6.x | Messaging | 6.1 one CTA, 6.2 offer conditions, 6.3 no competitors |

`KSR-1.2` and `KSR-3.1` are marked `knownUnclear` and seed the Guideline Debt Radar demo. Codes match the examples in the Round 1 deck.

### Claim Ledger highlights

| Code | Claim | State on demo date |
|---|---|---|
| KLE-07 | Free shipping above ₹999 | **Expired** 30 Sep 2026 → superseded by KLE-12 |
| KLE-12 | Free shipping above ₹1,499 | Valid (deck slide 7) |
| KLE-04 | Monsoon Weave OEKO-TEX certified | **Expired** 31 Aug 2026 |
| KLE-15 | Monsoon Weave ₹1,799 | **Expired** 31 Oct 2026 → superseded by KLE-16 (₹1,999) |
| KLE-10 | Festive Sale 20% off, 1–16 Nov | Valid until 16 Nov |
| KLE-03 | GOTS — Kesar Collection only | Valid (scope matters) |
| KLE-14 | Award 2024 | Valid, but must name the award and year |

There is deliberately **no** evidence for "#1", "India's most trusted" or "best".

## Test set — `testset/`

`drafts.json` holds 18 drafts with an answer key (`expected`) for each:

- **Unsupported claims:** D02, D03, D06, D10, D11
- **Stale facts:** D01, D04, D05, D16 (inside an image)
- **Voice drift:** D02, D07 (shouty agency), D08 (corporate agency)
- **Off-brand visuals:** D14 (retired logo), D15 (low contrast)
- **Terminology / accessibility / messaging:** D07, D09, D10, D12, D13
- **Clean (expect zero findings):** D17, D18 — these measure false positives

Each expected finding names the rule (and evidence if any), the exact quote, where it lives (`text`, `image`, `alt`), the failure kind, and whether code or AI should catch it. `tests/brand-pack.test.ts` checks every quote appears in the draft character for character.

Images (`testset/images/`) are SVG for now; Stage 11 converts them to PNG for OCR and vision models.
