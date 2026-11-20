# Roadmap (planned, not built)

1. **Hindi and Hinglish review:** rules, banned words and claim checks in Hindi, so Hindi posts are checked directly.
2. **Shared database and sign-in:** roles (creator, manager, reviewer, admin), approvals, version diff and an audit log of every accept, edit and dispute; per-brand data isolation.
3. **Intent Lock:** every suggested fix tested against the creator's purpose and must-keep points, shown as "Kept / Changed".
4. **Full image review:** logo version, contrast, palette, and claims hidden in banners.
5. **Model fallback chain and rate limiting:** a busy NVIDIA model should never slow a scan.
6. **Similar-past-decision search (embeddings)** and the **Guideline Debt Radar** built on real accept, edit and dispute history.
7. **Read-aloud findings (text-to-speech)** and **live transcription** while speaking.
8. **Guideline PDF import:** OCR and AI draft the rules and proof; a person approves.
9. **NVIDIA PII model** (`gliner2-pii`) next to the code-based masking.
10. **Hindi test set** to measure the catch rate on Hindi drafts.
