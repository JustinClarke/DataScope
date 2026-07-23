# 02.5 Large-File Fallback Strategy

**Tier:** v0 · Phase 1 · **Master spec:** §7.3 (D16), §15

## Objective

Never crash the tab. Detect oversized inputs before load and degrade through explicit,
banner-labeled tiers.

## Size tiers (§7.3 — post-D16)

| File size | Behavior |
| :--- | :--- |
| **< 50 MB** | Full ingest, no warnings. |
| **50–100 MB** | Full ingest + warning banner: *"Large file detected. Performance may vary on devices with limited memory."* Show estimated memory footprint. |
| **100–300 MB** | **Sampled preview mode.** First 100,000 rows via `read_csv_auto('file.csv', max_rows=100000)`. Persistent banner: *"Showing a 100K-row sample. Full dataset exceeds browser memory limits."* All modules operate on the sample. |
| **> 300 MB** | **Refuse with guidance (D16).** *"This file is too large for in-browser analysis (~X MB). Consider: (a) DuckDB CLI locally, (b) sampling the first 100K rows here, or (c) hosting the file on httpfs-readable object storage and pointing DataScope at it."* Once the hosted-staging tier exists, guidance gains **(d) staging it to DataScope cloud (opt-in; scheduled v1+, D39).** |

Temp cloud staging for >500MB is **revived by D39** (opt-in, R2-based — presigned PUT via the
Worker, lifecycle TTL, manual "Clear temporary data"; the exact D16 revival design) —
[`../../backlog/temp-staging.md`](../../backlog/temp-staging.md). Server-side *execution* over
staged data is new surface behind a **dedicated D39 design round** before build (v1+); until it
ships the >300MB tier stays refuse-with-guidance, and staging is only ever an **offered**
option (d), never a silent fallback. Option (c)'s remote-read mode is also backlog
([`httpfs-bucket-mode.md`](../../backlog/httpfs-bucket-mode.md)) — the refusal copy just points
at the workaround (any httpfs-readable bucket + DuckDB).

**Consumer-export size trap (D34, §7.3):** full personal-data archives — Google Takeout
especially — run to multiple GB, straight into the refusal tier. The D30 templates and the
`/google-takeout` page instruct **component selection at export time** (My Activity, not
full-resolution Location History); a whole-archive drop degrades gracefully through the
tiers above, never a hard error.

## Memory monitoring (§7.3, §15)

- Estimate headroom **before** ingestion: `performance.memory` (Chrome) /
  `navigator.deviceMemory`. If estimated post-load memory exceeds **70% of available**,
  auto-downgrade to sampled preview even under the size threshold.
- Folders: tiers apply to the **aggregate** (§7.5) — pre-scan sizes first, offer per-file
  sampled mode when combined size busts the tier.
- 100MB+ ingests stream via `FileReader` chunks with progress (§15).
- Browser tab ceiling is ~2GB (§4); peak-memory budget is 512MB for <50MB datasets
  ([`performance-budgets.md`](../../foundations/performance-budgets.md)).

## Files

`src/features/ingestion/` (size pre-scan, tier decision, banners, refusal modal), memory
estimation helper in `src/lib/`.

## Dependencies

[01-file-drop.md](01-file-drop.md) (runs before its step 1), [04-multi-file.md](04-multi-file.md)
(aggregate mode).

## Acceptance criteria

- [ ] 150MB CSV → sampled preview + persistent banner (§22)
- [ ] 400MB CSV → refusal modal with the three-option guidance (§22)
- [ ] 60MB CSV → full ingest + warning banner with memory estimate
- [ ] Low-headroom device (simulated) → auto-downgrade to sampled preview
- [ ] Sampled mode: all modules run against the sample; banner never dismisses silently

## Test plan

Unit: tier-decision function across boundary sizes (49/51/99/101/299/301 MB) and headroom
values. E2E with generated fixtures for the 150MB and 400MB paths (generate at test time;
don't commit the fixtures).

## Definition of done

§22 edge-case rows pass; no path exists where a file reaches `arrayBuffer()` without a tier
decision first.
