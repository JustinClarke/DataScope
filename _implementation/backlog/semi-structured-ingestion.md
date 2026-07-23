# Backlog: Semi-Structured & Log Ingestion — Deterministic Template Extraction

**Tier:** backlog — designed, deferred, no v0/v0.5/v1 scope change · **Master spec:** §7.1,
§4 (D32 non-goal extension), §20.14 · **Decisions:** D66 (this row), D32/D47 (RAG-boundary
precedent), D49/D58 (QueryEngine/registry, no-parallel-pipelines), D45 (evidence + confidence
discipline), D43 (per-technique verification before a capability claim).

An ingestion path that extends DataScope's tabular-data core to **semi-structured text** —
application/server logs, key-value blobs (env files, syslog KV pairs), and JSON with
inconsistent or drifting shape — without adding AI anywhere in the ingestion path. This is
new format-support surface, not a hardening of anything already scheduled; it is recorded
here so the design isn't re-derived later, and stays out of the v0/v0.5/v1 critical path.

## Why deterministic, and why it can still be good

Unstructured prose, images, and audio have no recoverable schema without an ML/LLM layer —
deterministic methods there yield metadata and statistics only, never understanding (the
boundary D32 already draws; the reason those formats are explicitly out of scope here).
Semi-structured text is different: logs and key-value blobs already have a recurring, if
inconsistent, structure. The job is pattern *recognition*, not comprehension — squarely
deterministic territory, and arguably a better fit for DataScope's transparency posture than
an LLM guess would be (no hallucinated field, every extraction traceable to its matched
pattern).

## Design sketch

- **Log-template extraction** — cluster recurring line shapes using the Drain family of
  algorithms (tokenize each line, build a prefix tree keyed on token count and position,
  cluster near-identical lines into templates) to recover a per-template schema (timestamp,
  level, source, free-form fields) without hand-written per-format parsers.
- **Regex/pattern field extraction** — a small library of common field patterns (timestamps,
  IPs, emails, UUIDs, `key=value` pairs) applied per detected template. Every extraction
  carries a confidence score and the matched pattern as evidence — the same evidence +
  confidence discipline DSPS facts already use (D45), never a silent guess.
- **Output is an ordinary table.** Extracted fields register through the existing
  `QueryEngine`/table registry (D49/D58) — profiling, classification, the broker, SQL,
  charts, and DSPS all work unchanged. No new downstream pipeline, no new engine; the D58
  no-parallel-pipelines principle holds by construction.
- **Explicitly out of scope:** prose documents, images, audio, video — deterministic methods
  can't recover meaning from these, only metadata (file size, EXIF, language detection via
  character n-grams), which isn't worth shipping as a headline capability.
- **Explicitly not RAG (extends D32, per D47's precedent):** structural parsing of recurring
  patterns into fields — no text chunking for retrieval, no embeddings, no vector search. The
  D32 non-goal is unchanged.

## Why deferred

v0's Oct 6 date and the D15 cutline are scoped to structured/tabular ingestion (CSV/Parquet/
JSON, D1); this is genuinely new format-support surface, not a v0/v0.5/v1 Studio-arc
extension, and it doesn't compete with anything already on the critical path.

## Trigger

A concrete source of semi-structured data (e.g., a design partner's log export, or a user
request the existing formats can't satisfy) — or its own dedicated design round once v0/v0.5
ship. The log-template clustering approach needs its own spike (D18-style) before a
capability claim is made, per the D43 local-model-honesty precedent: any new extraction
technique needs its own verification before the UI claims it works.
