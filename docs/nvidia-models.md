# NVIDIA models — tested on our account (13 Nov 2026)

All calls go to `https://integrate.api.nvidia.com/v1` (OpenAI-compatible). Our four `nvapi-` keys are
interchangeable: each authenticates and sees the same 83-model catalog. `NVIDIA_API_KEY` is primary;
`NVIDIA_API_KEY_2…4` are spares the client can rotate to on rate limits (429).

Note: a model being listed in `/v1/models` does **not** mean our account can call it — several return
404 ("function not found for account") or 410 (end of life).

## Chosen

| Job | Model | Result | Notes |
|---|---|---|---|
| Main reasoning LLM | `nvidia/nemotron-3-ultra-550b-a55b` | ✅ ~1.2 s for a short reply | Findings, fixes, Intent Check, rule drafts |
| Fast LLM / fallback | `nvidia/nemotron-3.5-lightning-30b-a3b` | ✅ ~1 s | Reasoning model: returns `reasoning_content` separately; give it enough `max_tokens` |
| Tiny LLM (cheap triage) | `nvidia/nemotron-3.5-bolt-e4b` | ✅ ~0.6 s | |
| Embeddings | `nvidia/nemotron-3.5-embed-1b` with `dimensions: 1024` | ✅ ~0.8 s | Default is 2048 dims; 1024 fits a pgvector HNSW index (limit 2000). Needs `input_type: "query" \| "passage"` |
| OCR (text in images) | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` | ✅ ~6 s, exact transcription of our test banner | The standalone OCR endpoint is end-of-life |
| Vision (logo, alt text) | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` | ✅ | `nvidia/nemotron-3.5-super-vl-120b-a12b` also works but took ~57 s |
| Content safety | `nvidia/llama-3.1-nemotron-safety-guard-8b-v3` | ✅ returns `{"User Safety": "safe"}` | Backup: `meta/llama-guard-4-12b` |
| Translation (stretch) | `nvidia/riva-translate-4b-instruct-v2` | ✅ English → Hindi | |

## Structured output

| Method | Result |
|---|---|
| `nvext.guided_json` | ❌ 400 — field not accepted |
| top-level `guided_json: <schema>` | ✅ accepted |
| `response_format: { type: "json_object" }` | ✅ valid JSON |
| `response_format: { type: "json_schema", … }` | ✅ accepted; reasoning models need a larger `max_tokens` or content comes back null |

Plan: `response_format` json_schema (or top-level `guided_json`) → Zod validation → one retry → drop.

## Not available — and what we do instead

| Job | What happened | Replacement |
|---|---|---|
| Reranker | `llama-3_2-nv-rerankqa-1b-v2` 410 (EOL), `nv-rerankqa-mistral-4b-v3` 404 | Embedding similarity, then the fast LLM picks the relevant rules |
| PII detection | No PII model in our catalog | Code (regex for emails/phones/IDs) + marked spans; LLM pass optional |
| Standalone OCR | `nemoretriever-ocr-v1` 410 (EOL) | Omni vision model above |
| Speech-to-text / TTS | Not on this endpoint (separate gRPC API) | Stretch goal only |
| Other LLMs tried | `nemotron-3-super-120b`, `llama-3.1-nemotron-70b`, `llama-3.1-nemotron-ultra-253b`, `nemotron-nano-3-30b`, `kimi-k2.6`: 404. `gemma-4-31b`, `nemotron-3.5-embed-8b`, `nemoguard-8b-content-safety`: timed out | — |
