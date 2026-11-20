# Roadmap (planned, not built)

1. **Native Hindi and Hinglish review:** rules, banned words and claim checks written in Hindi, so Hindi posts are checked directly and findings quote the original Hindi (today Hindi is translated to English first).
2. **Shared database and sign-in:** roles (creator, manager, reviewer, admin), approvals, version diff and an audit log of every accept, edit and dispute; per-brand data isolation.
3. **Intent Lock, next step:** let creators override and explain, and learn which fixes people accept anyway. (The check itself is built.)
4. **Full image review:** logo version, contrast, palette, and claims hidden in banners.
5. **Model fallback chain and rate limiting:** a busy NVIDIA model should never slow a scan.
6. **Similar-past-decision search (embeddings)** and the full **Guideline Debt Radar**: draft a sharper rule from disputed cases, replay it on past content, owner approves. (The decision log and ranking are built, per browser.)
7. **Read-aloud findings (text-to-speech)** and **live transcription** while speaking.
8. **Guideline PDF import:** OCR and AI draft the rules and proof; a person approves.
9. **NVIDIA PII model** (`gliner2-pii`) next to the code-based masking.
10. **Hindi test set** to measure the catch rate on Hindi drafts.
