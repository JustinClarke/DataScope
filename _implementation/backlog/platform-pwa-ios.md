# Backlog: Platform Expansion — PWA, iPad/iOS, Desktop

**Tier:** backlog (partially scheduled) · **Master spec:** §20.9, §4 (desktop-first) ·
**Decisions:** D51 (desktop charter), D49 (`QueryEngine` boundary)

**Responsive web (scheduled — Phase 6 polish, not really backlog):** one Tailwind
breakpoint — collapsible sidebar on iPad portrait, full sidebar on landscape. Monaco and
charts are already responsive; SQL playground + chart switching stay usable at iPad width
with a hamburger menu. Test on Safari iPad before public ship.

**PWA (low-cost, targeted at the v1/Studio ship):** `manifest.json` + service worker
(workbox or similar). Installable from Safari home screen; works fully offline — all logic
is client-side and DuckDB-Wasm is cached. Minimal ceremony, no server-side dependencies.
Surfaces as a "DataScope Studio" icon, behaves like a native app.

**Native iOS (future, demand-driven):** only if iPad users ask for deeper integration
(Files-app drag-and-drop, photo library import). React Native or Flutter — a separate
codebase, low priority until traction. Not a Tauri concern.

**Desktop client — the D51 charter (Tauri; replaces the old "desktop clients — primary"
line).** React UI in **Tauri v2** with a **native-DuckDB sidecar** (duckdb-rs) behind the D49
`QueryEngine` interface, results over **Arrow IPC** — explicitly *not* DuckDB-Wasm inside the
webview. What it unlocks, in value order:

1. **The >300MB refusal tier (§7.3) disappears on desktop** — native DuckDB uses machine RAM
   and spills to disk, so multi-GB Takeout archives and real Parquet lakehouse folders become
   first-class (the single biggest capability delta in the backlog; fixes the D34 consumer
   size trap as a side effect).
2. **Air-gap distribution** — a signed installer for machines with no internet: the literal
   endpoint of the §24 Play-1 story and the predictable §24.4 design-partner ask.
3. **Folder-watch → automatic Drift Report (D44)** — the retention ritual matured from manual
   re-drop to ambient habit.
4. **Native niceties** — real file dialogs, `.dsps` file association, no tab-death, faster
   cold start.

Real costs, held honestly: the Rust toolchain, a 3-OS build/sign/notarize pipeline, an
auto-updater, a per-OS QA matrix, and a **second engine held to D40-style verification
discipline** (any per-engine capability claim needs its own verification). Therefore
**rung 3 on the D61 platform ladder — after the hosted tier ships** (browser → hosted tier →
desktop → rest on request), with one retained early-pull exception: **a design partner asking
for air-gap may pull desktop forward** (the predictable §24.4 ask). Trigger otherwise: v0.5
shipped with the §18 steering bars green; **never before the Oct 6 date (D27)**. **Free forever**
per D28's own
no-server-cost logic — a trust asset, not a revenue line. Desktop is a **surface**, not a
differentiator (Duckling and Duckle already occupy the Tauri-desktop lane, §3.4); ②, the Drift
Report, and the travelling artifact differentiate whatever the shell — the web app stays the
funnel and the identity.
