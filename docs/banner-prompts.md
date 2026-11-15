# Banner prompts for the three scan examples

**Already built in:** the three generated banners live in `public/showcase/` and load with Examples 1–3 automatically, with the alt text below. To show the upload feature live, remove the banner from an example and upload the same file (or a new one) yourself.

Make one banner per example, then upload it on **Scan a draft → step 3 (images)** with OCR on.
NVIDIA's vision model reads the text in the banner, and Kasauti checks that text against the Claim Ledger, just like the copy.

> **The words in the banner must be exact.** Image generators often misspell text or mangle the ₹ sign.
> Check the result letter by letter. If it's wrong, generate the background without text and add the lines in Canva/Figma (Fraunces for headings, Inter for the rest).

Brand look (from the brand pack): background **Cotton #F7F3EA**, text and logo **Indigo #1F2A5A**, sale badge **Clay #B5562F**, accent **Kesar #E8A33D** (accents only, never small text on a light background). Logo: indigo spindle mark (a circle with a thread looping through it) next to the serif wordmark “Dhaaga & Co.”.

---

## Banner 1: goes with Example 1 (Festive sale post)

**Square, 1080 × 1080.** This one breaks the rules on purpose.

```text
Square 1080x1080 Instagram sale banner for a fictional Indian handwoven home-textiles brand called "Dhaaga & Co.". Flat lay of folded indigo and saffron striped cotton bedsheets on a warm off-white (#F7F3EA) background, small marigold flowers and a brass diya at the edges for a festive Diwali mood. Clean editorial layout, lots of space, crisp, legible typography in deep indigo (#1F2A5A), with a rust-orange (#B5562F) badge behind the second line. Small logo at top-left: an indigo circle with a thread looping through it, next to the serif wordmark "Dhaaga & Co.". Render EXACTLY these lines of text, spelled exactly, each on its own line, large and high-contrast:
"FESTIVE SALE"
"30% OFF EVERYTHING"
"Free shipping above ₹999"
"India's #1 bedsheet brand"
No other text, no watermark.
```

**Upload with:** the alt text left **empty**.

**Kasauti should flag (from the image):**
| Text in banner | Rule | Why | Fix |
|---|---|---|---|
| 30% | KSR-4.1 | contradicts KLE-10 (sale is 20%) | 20% |
| ₹999 | KSR-4.1 | stale: KLE-07 expired, replaced by KLE-12 | ₹1,499 |
| #1 | KSR-4.2 | no proof in the ledger | person rewrites |
| (no alt text) | KSR-5.1 | missing alt text | add alt text in the finding card |

---

## Banner 2: goes with Example 2 (Brand story email)

**Wide, 1200 × 600 (email header).** Old facts baked into an image.

```text
Wide 1200x600 email header banner for a fictional Indian handwoven bedding brand "Dhaaga & Co.". Soft morning light on a neatly made bed with an indigo-and-white striped handwoven cotton bedsheet set called Monsoon Weave; a window with monsoon rain outside. Warm off-white (#F7F3EA) panel on the left third holding the text. Small logo above the text: an indigo circle with a thread looping through it, next to the serif wordmark "Dhaaga & Co.". Elegant serif headline, clean sans-serif for the rest, all in deep indigo (#1F2A5A), highly legible. Render EXACTLY these lines, spelled exactly, each on its own line:
"The Monsoon Weave"
"Now ₹1,799"
"OEKO-TEX Standard 100 certified"
"Rated 4.8/5 by 25,000 customers"
No other text, no watermark.
```

**Upload with:** alt text **`IMG_2041.png`** (a file name passed off as alt text, which is a common mistake).

**Kasauti should flag (from the image):**
| Text in banner | Rule | Why | Fix |
|---|---|---|---|
| ₹1,799 | KSR-4.1 | stale: KLE-15 expired, now KLE-16 | ₹1,999 |
| OEKO-TEX Standard 100 | KSR-4.3 | certificate KLE-04 expired 31 Aug 2026 | remove until renewed |
| 4.8/5 | KSR-4.2 | contradicts KLE-06 | 4.6/5 |
| 25,000 customers | KSR-4.2 | contradicts KLE-06 | 18,000 customers |
| alt = file name | KSR-5.1 | alt text is a file name | describe the image |

---

## Banner 3: goes with Example 3 (Restock post, clean)

**Portrait, 1080 × 1350.** Everything true: Kasauti should stay quiet.

```text
Portrait 1080x1350 Instagram post for a fictional Indian handwoven bedding brand "Dhaaga & Co.". A calm, sunlit bedroom with an indigo-and-white striped handwoven cotton bedsheet set (Monsoon Weave), a cup of chai on a wooden side table, soft natural shadows. Warm off-white (#F7F3EA) band across the bottom third holding the text. Small logo at the top: an indigo circle with a thread looping through it, next to the serif wordmark "Dhaaga & Co.". Calm, premium typography in deep indigo (#1F2A5A), very legible; a small saffron (#E8A33D) underline accent under the headline only. Render EXACTLY these lines, spelled exactly, each on its own line:
"The Monsoon Weave is back"
"₹1,999"
"20% off sitewide until 16 November"
"Free shipping above ₹1,499"
No other text, no watermark.
```

**Upload with:** alt text **`Indigo striped Monsoon Weave bedsheet set on a sunlit bed, with the price ₹1,999 and the festive offer`**

**Kasauti should flag:** nothing. Every number in the banner matches a live ledger entry (KLE-16, KLE-10, KLE-12), and the alt text describes the image.

---

## Demo order (about 3 minutes)

1. **Example 1** → watch the findings stamp in → upload Banner 1 → **Run scan** → the stale ₹999 and 30% in the image are caught → **Accept all fixes** → new version, re-scanned.
2. In the Claim Ledger window, press **Add proof to ledger** on “most trusted” → it turns **verified**.
3. **Example 2** → contradicted facts fixed from the ledger, AI catches GOTS stretched to every product → open `ai_disclosure.txt` to show the email and phone were masked before the model saw them.
4. **Example 3** + Banner 3 → nothing flagged; the Claim Ledger shows every claim verified, with an “expires in 3 days” warning on the 20% offer.
5. **Rulebook / Claim Ledger** → press **Edit** on a rule or entry, save, re-scan, and the result changes.
