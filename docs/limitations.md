# Known limits

Written plainly, so nobody is surprised.

## Not built yet
- **No database, login, roles, approvals or audit log.** Rules, proof, the custom brand pack and version history are saved only in the browser you used. Another browser, or cleared site data, starts fresh, and nothing is shared between people.
- **Intent Lock is not built.** The Intent Card is read by the AI reviewer, but a suggested fix is not tested against it.
- **Image review is partial.** We read text inside banners and check alt text. We do not check logo version, contrast or palette yet.
- **The Insights page is a preview.** It is not a working Guideline Debt Radar and does not learn from real disputes.
- **Disputes and notes are not logged.** They stay in the browser session.

## Languages
- The app works in English and Hindi only. Speech can be recorded in either, and text can be returned in either.
- **Rule checks run on English text.** Hindi text added to the copy box is not checked by the English rules. To test, record Hindi and choose English text.
- Hindi numbers become digits and the demo brand's names are restored from a small list of Devanagari spellings. Other names, and Hindi speech recognition errors, can still appear; the transcript can be edited.

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
