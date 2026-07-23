# Backlog: `httpfs` Bucket-First Workbench Mode

**Tier:** backlog · **Master spec:** §20.3 rung 1, §3.3, §7.1

Read Parquet **directly from R2/S3-compatible object storage** via DuckDB `httpfs`, without
passing files through browser memory — turning DataScope into a workbench over data that
lives in buckets.

**Why it matters (§3.3):** the Parquet/lakehouse ecosystem (DuckDB, MotherDuck,
Iceberg/Delta, S3-resident data) is growing faster than its tooling, and most analytics UIs
still assume a SQL warehouse. This is the DuckDB-ecosystem play — and it sidesteps the ~2GB
tab ceiling for large files entirely (the §7.3 refusal copy already points users at this
workaround manually).

**Shape when built:** a "connect to bucket" ingestion path (URL + optional credentials);
tables register in the registry with a remote source tag; profiling runs over remote reads
(mind the request patterns — SUMMARIZE over httpfs is many range requests); refresh =
re-read. Credentialed buckets intersect with the vault
([`tier3-vault-ingestion.md`](tier3-vault-ingestion.md)).

**Trigger:** demand from the Parquet-first data-engineer audience (§2) — likely the first
backlog item they'll ask for.
