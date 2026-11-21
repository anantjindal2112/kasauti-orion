# Known limits

Written plainly, so nobody is surprised.

## Not built yet
- **Sign-in is a demo system.** There is a shared database with roles, approvals, comments, versions and an audit log (see `docs/workflow-and-database.md`), but accounts are the four demo ones (password shown on the sign-in page): no sign-up, no password reset, no email check. Anyone can sign in as any demo role.
- **Rules, proof and the custom brand pack are still saved only in your own browser.** Another browser, or cleared site data, starts fresh, and they are not shared. Only submissions, comments, decisions and the audit log are shared.
- **The in-browser version history** inside the scanner (before you save) is not stored; saved versions are.
- **Our own sign-in, not Supabase Auth.** Authorisation is enforced in the API routes, not by row level security (RLS is on with no policies so the public API can read nothing). Wrong-password slowing is per server instance.
- **Image review is partial.** We read text inside banners, check alt text, and check text contrast and the logo version. We do not check the brand palette or logo clear space yet.
- **Image colours and logo are read by a model.** Contrast is exact arithmetic, but the two colours are the vision model's reading of the picture, so only clear misses are shown as verified; near-misses and every retired-logo call go to a person. A busy photo or a gradient behind the text can fool it.
- **The Insights Radar is an early version.** Signed in, it ranks rules by the whole team's decisions; signed out, by this browser's. It does not yet draft a sharper rule, replay it on past content, or let an owner approve it.

## Languages
- The app works in English and Hindi only. Speech can be recorded in either, and text can be returned in either.
- **Hindi and Hinglish are reviewed directly**, with Hindi term lists next to the English ones (`lib/checks/hindi.ts`). The lists cover common terms, not every word: a banned word, superlative or pressure phrase that is not on them is only caught if the AI reviewer notices it.
- **Hindi gaps:** the reading-grade check (it counts English syllables) and the shouting check (Hindi has no capital letters) do not apply; Devanagari digits (१९९९) and number words typed in a draft (एक हजार) are not turned into numbers, so a price written that way is not checked against the ledger (voice transcripts are converted before they reach the box); quoting a Devanagari spelling of the brand or a product name is flagged because the names are written in English letters.
- Spoken Hindi numbers become digits and the demo brand's names are restored from a small list of Devanagari spellings. Other names, and Hindi speech recognition errors, can still appear; the transcript can be edited.

## Tidy text and sample phrases
- Tidy text is generic: it does not follow the brand guidelines and it will not fix wording. If the model's version changes a word (for example "dont" to "don't"), it is discarded and only the safe code tidy-up is used, which is plainer (it will not capitalise a month, for instance).
- The sample phrase is checked by our own rules, but it can still be dull. About one request in a few fails the rule checks five times in a row; try "New phrase".

## Intent Lock
- The model's judgement of "does this keep the message" is imperfect and can be too strict or too lenient. Code decides what it can see (a must-keep phrase that vanishes, an unproven lower discount) and always wins over the model, and a ledger-proven correction is never blocked. A person always makes the final call.
- Fixes that remove a must-keep phrase are held back from "Accept all".

## AI behaviour
- **The AI can be wrong and varies between runs.** Edited drafts use whichever NVIDIA model answers first; the faster model sometimes raises a finding that is not real. The Verifier drops many of these (including findings that say the text is fine), but not all. Code checks never vary.
- On roughly 1 in 6 scans under load the AI claim-finding pass times out. The code-based ledger is still shown, but plain-word claims may be missed on that scan.
- NVIDIA models are sometimes slow or return 503. If the embedding model is slow, the whole ledger is sent to the reviewer instead of the closest entries, which can change results slightly.

## Demo behaviour
- The three examples replay a saved real NVIDIA run, so they show the same result each time. Once anything is changed, the scan runs live (about 8 to 15 seconds).
- Expiry checks use a fixed demo date (13 Nov 2026), not today's date.
- One demo brand only (Dhaaga & Co.).
- Voice audio is sent to NVIDIA's speech model when you press Transcribe, and it is not masked.
- A problem printed inside a banner image cannot be fixed by editing the copy; it needs a new banner.
