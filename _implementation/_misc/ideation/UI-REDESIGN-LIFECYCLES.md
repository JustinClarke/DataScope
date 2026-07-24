# UI Redesign — User Lifecycles & Action Placement

**Status: ideation draft, 2026-07-24 — first pass for reaction, not sign-off.** Third
companion to `UI-REDESIGN-SPEC.md` and `UI-REDESIGN-PLAN.md`. It exists to resolve two
decisions that the §9 stance-walk (2026-07-24) deliberately re-opened rather than ratified:

- **§9.2 (reframed by Justin):** the old app-open AI-mode modal becomes a **data-handling
  question** — *"how do you want your data handled after you upload it?"* — shown **after
  upload, before the map is revealed**. This doc places that beat in the journey and
  proposes its shape.
- **§9.3 (reframed by Justin):** the old sidebar's actions don't just "dissolve" — they
  **scatter across the shell**, and *where each one lands* is decided by walking real user
  lifecycles, not by fiat. This doc walks them and proposes an action-placement table.

The other six §9 items are ratified (see PLAN.md §5): 1-A, 4-A, 5-A, 6-A, 7-A (built
C-ready), 8-A. This doc feeds the next step — a hallmark mock of the assembled shell with
actions placed — and, after that, the formal fold into master.

Everything here is a **proposal to react to**. Nothing edits master, the tree, or the
Decision Record.

---

## 1. The cast — four journeys worth designing for

Chosen because each one stresses a *different* placement question. Consumer landing-page
arrivals (D30, `/spotify` etc.) are not a fifth journey — they funnel into Act 0 and become
J1 or J2.

| # | Persona | What they want | The placement question it stresses |
| :--- | :--- | :--- | :--- |
| **J1** | Cold first-timer, exploring solo | "What's in this data? What should I even look at?" | The **options strip** — where do "next" actions live, and how are they ranked, when the user has no idea what to do? |
| **J2** | Analyst with an AI copilot | "Ask questions in English, get charts back" | The **right pane** + how AI-produced artifacts open as tabs; the data-handling prompt's AI branch |
| **J3** | Returning / power analyst | "I know this data, get me to it fast" | The **`skipToData` intent** — is a shortcut still needed, and where? |
| **J4** | Share-link / `.dsps` recipient | "Someone sent me this; let me look" | **Viewer mode** — which actions are *absent*, read-only trust chrome |

---

## 2. The journeys, moment by moment

Notation: **⟦gate⟧** = a beat the user must pass through; **[action]** = an action available
at that moment, with its proposed home in parentheses.

### J1 — Cold first-timer, solo

1. **Act 0 — Welcome.** Editorial page, zero questions. Actions present: `[drop file]`
   `[paste URL]` `[try a sample]` (all on the welcome page). Nothing else exists yet.
2. **Act 1 — Upload.** Existing ingestion runs; honest phase labels in a progress state.
   No new actions — the machinery is unchanged.
3. **⟦Act 2 — Data-handling gate⟧.** *Before the map paints*, one question:
   *"How do you want your data handled?"* Two postures (see §4):
   **keep on this device** (default) / **allow cloud AI**. The solo explorer picks
   *keep on device* and **never sees an AI dialog again** unless they later summon AI.
4. **Act 3/4 — Shell assembles, map opens.** Left **explorer** (their tables), middle
   **canvas** with the **map** as the open tab, bottom **inspector** (empty). No right pane
   (non-AI path).
5. **"Now what?"** This is J1's crux. The user selects a table on the map (or in the
   explorer). The **options strip above the map** lights up with **ranked next actions**
   (`rankNextActions`, D68a): `[Profile]` `[Chart …]` `[SQL]` `[Pivot]` `[Correlation]` —
   ordered by interestingness, capability-gated. Selecting one opens a **tab on the answer**.
6. **Inspecting.** Selecting a map **edge** (a relationship) fills the **inspector** with the
   FK evidence + confidence (D24); overrides reachable there.
7. **Producing & keeping.** A chart/query result they like → `[pin]` becomes an **artifact
   tab**. `[Export CSV/XLSX/Parquet]` and `[Jupyter]` are **per-tab actions** on that result.
8. **Sharing.** `[Share]` (from the canvas or explorer) opens the share dialog → R2 link;
   the **links list** lives in the explorer.

### J2 — Analyst with an AI copilot

1-2. Same Act 0 / Act 1.
3. **⟦Data-handling gate⟧.** Picks **allow cloud AI** → the existing **three-mode consent**
   unfolds inline (D2 substance preserved: local WebLLM / cloud BYOK / off — no silent
   default, no inference before the choice). This is the *only* place the deeper AI plumbing
   appears, and only for this branch.
4. **Shell assembles with the right pane.** The **AI chat** docks on the right, full per-turn
   audit trail intact.
5. **Asking.** User types English → AI **generates a spec** (ChartSpec/ViewSpec), which opens
   as an **artifact tab** via the deterministic renderer (D55 — never executes model output).
   The audit trail (SQL, timings, retries, sampled-rows) is styled as a feature in the pane.
6. Otherwise J1's strip, inspector, export, share all apply — AI is *additive*, not a
   different app.

### J3 — Returning / power analyst

1. Arrives, drops a file (or reopens a session, post-hosted-tier). Act 1 as usual.
2. **⟦Data-handling gate⟧.** Decided (§4): **asked every upload, for now** — no stored
   preference yet, so the returning analyst sees the same two-option gate again on this
   upload. Deliberately revisitable once the shell sees real use.
3. **The map opens — but it's not a wall.** The **explorer is right there**. "Skip to data"
   used to mean *bypass the briefing, show me the grid*. In the Workbench that intent is
   **structural, not a toggle**: click a table in the explorer → its **Profile tab** opens
   directly. No modal, no landing-decision.
4. For the analyst who *always* wants that, a **settings preference** "open on last table's
   Profile instead of the map" serves the habit without a per-session question. (This is the
   proposed fate of `skipToData` — §5.)

### J4 — Share-link / `.dsps` recipient (viewer mode)

1. Opens a `?share=` URL or a dropped `.dsps`. **No upload, no data-handling gate** — the
   data-handling choice was the *sender's*; the recipient sees only structure (D20/D31/D62).
2. **The same shell, read-only.** Map-forward, unmistakably "not your session": the options
   strip is **fully absent** (decided §7 — no producing new analysis on someone else's
   structure report), the explorer is read-only, no right pane. D63 trust-chrome slot
   reserved (signed provenance).
3. Present actions: `[view the map]`, `[inspect an edge]`, and the exits —
   `[start my own session]` (→ Act 0) and, where the payload allows, `[export the report]`.

---

## 3. Action-placement table (the synthesis)

Every action from spec §6, its proposed home(s), and the journey moment that earns it a
home. **"Strip"** = the options strip above the map. **"Palette"** = every action also lives
here (the escape hatch, §3) — listed only where the palette is a *notable* secondary home.

| Action | Primary home | Also reachable | Earned by |
| :--- | :--- | :--- | :--- |
| Drop / URL / sample | Act 0 welcome | Explorer *Add data*; whole-window drop; palette | J1/J2 start; adding data mid-session |
| **Data-handling posture** | **Post-upload gate (Act 2), pre-map** | Settings pane (change later); palette | J1/J2 §2.3 |
| Open the map | Default open tab | Explorer root; palette | all journeys |
| Profile (per table) | Explorer table-click → Profile tab; **strip** when a table is selected | Ranked action; palette | J1 §2.5 |
| SQL playground | **Strip** | Palette; ranked action | J1/J3 |
| Charts (time-series / distribution / categorical) | **Strip** (subject = selection); ranked action → chart/artifact tab | Palette | J1 §2.5 |
| Pivot | **Strip** | Palette; ranked action | J1 |
| Correlation | **Strip** | Palette; ranked action | J1 |
| Ranked "next" actions | **Strip, above the map, broker-ordered** | Palette | J1 §2.5 — the crux |
| AI chat | Right pane (AI path only) | Palette "Ask AI" → **re-opens the full data-handling gate** (§4) | J2 |
| Insight feed → open-as-chart | Profile tab section + map top-insights | Palette | J1 |
| Pin a result | Per-tab `[pin]` → artifact tab | — | J1 §2.7 |
| Export CSV / XLSX / Parquet | Per-tab / per-table action | Palette | J1 §2.7 |
| Structure report (DSPS / HTML) | Share/export surface | Palette | J1 / J4 |
| Jupyter handoff | Per-table / per-tab action | Palette | J1 |
| Share (R2 link) + links list | Share dialog from canvas/explorer; links list in explorer | Palette | J1 §2.8 |
| Sensitive-column nudge | Inside the share flow (unchanged) | — | J1 sharing |
| Refresh-from-source | Per-table explorer action | Palette | J3 returning |
| Remove table | Per-table explorer action | Palette | cleanup |
| Edge evidence / FK overrides | **Bottom inspector** (edge selected) | — | J1 §2.6 |
| Settings (AI/BYOK, theme, privacy, engine) | **Settings tab** (§7) via gear + palette | Status-bar quick toggle (theme) | any time |
| `skipToData` intent | (no toggle) explorer click-through; optional default-tab setting | — | J3 §2.4 |
| Viewer exits (start own session / export) | Viewer-mode chrome | — | J4 |

**Two placement rules that fall out of the walk:**
1. **The strip acts on the selection.** Both the map and the explorer are selection
   surfaces; the strip resolves its subject from whatever is selected. An action with no
   valid subject is gated off the strip (still in the palette).
2. **Producing lives near the artifact; managing lives in the explorer; rare lives in the
   palette.** Export/pin/Jupyter attach to the tab that produced the thing; refresh/remove/
   share-links attach to the table in the explorer; everything is in the palette.

---

## 4. Decided — the data-handling prompt (§9.2)

> **Superseded (2026-07-24, AI-V2 review — Change A).** The per-upload two-option gate
> described below is dead. The shipped model is the flat, always-visible switch
> (`Off` / `Cloudflare` / `WebLLM` / `Your own key`) with **no forced post-upload gate** —
> now the source of truth in master `DATASCOPE.md` §5.1 and Decision Record D2/D71/D72. The
> text below is retained as history, not as live design.

**Placement:** a single gate in Act 2, **after Act 1 upload completes, before the map
paints.** It is the reframed replacement for today's app-open `AIModeChooser`.

**Shape — two options (decided 2026-07-24):**

| Posture | What it means | Unfolds |
| :--- | :--- | :--- |
| **Keep everything on this device** *(default)* | No data-derived facts leave the browser. AI is off, or later runs only as in-browser WebLLM. | Nothing — straight to the map |
| **Allow cloud AI** | Pruned structural facts (D37/D58) may go to a model provider. | The existing three-mode consent inline (D2 substance: local / cloud-BYOK / off) |

Why this framing fits: DataScope's whole pitch is *"nothing leaves your machine."* Making the
user **affirm a data posture** right after they hand over data — rather than answer an
"AI plumbing" question at app-open — turns the privacy promise into a deliberate choice at
the exact moment it becomes real. The non-AI user answers once per upload and is never taxed
with AI chrome (preserves §9.6 no-mode-switch + the spec's "non-AI path sees no AI dialog").
The AI user gets the full D2 consent, just relocated.

**Re-ask cadence — every upload, for now (decided 2026-07-24).** No stored posture, no
settings-pane memory yet: the gate reappears on every fresh upload, keeping the privacy
choice conscious each time rather than becoming an implicit default. Revisit if this proves
too much friction once the shell is in real use — "for now" is deliberate, not a closed
decision.

**Summoning AI after keep-on-device — re-open the full gate (decided 2026-07-24).** A user
who chose *keep on this device* and later hits the palette's **"Ask AI"** re-runs the same §4
two-option gate — *not* a lighter "switch to cloud?" confirm. One code path, and it keeps the
posture choice conscious at the moment it would actually change, consistent with the
per-upload cadence above. (Resolves the §3 "Ask AI" seam.)

**This is a larger D2 change than PLAN.md §5.2 assumed** (that stance was "same AI question,
later"). It reframes *and* relocates. Flagged for the formal pass as a substantive D2 edit.

---

## 5. Proposal — `skipToData` (§9.3)

`skipToData` (D68d) is **retired as a toggle/landing-decision.** Its intent — *the returning
reader who wants the data, not the briefing* — is served two ways in the shell:

1. **Structurally (default):** the explorer is always present; clicking a table opens its
   Profile tab directly. The map is a landing, never a wall, so "skipping" it costs one
   click that the user was going to make anyway.
2. **As a preference (for the habit):** a settings-pane option "open on the last table's
   Profile instead of the map." No per-session modal; it's a stored choice.

This keeps "zero questions" intact while not *deleting* the behaviour some users rely on.

---

## 6. What the mock will show (next step)

A hallmark HTML mock of the **assembled shell (Act 3/4)** for **J1** — the highest-leverage
journey — with:
- the **options strip above the map**, broker-ordered, acting on a selected table;
- the **explorer** with per-table actions;
- the **inspector** showing edge evidence;
- a placed **gear → settings** and **palette** affordance.

And a second, smaller frame: the **data-handling gate** (§4) as it appears between upload and
map. Viewer mode (J4) and the AI right pane (J2) are noted but not the first mock's focus.

---

## 7. Decisions (Justin, 2026-07-24)

All four open questions resolved:

> **Superseded — items 1–2 (2026-07-24, AI-V2 review Change A).** The data-handling posture
> and the per-upload re-ask cadence below were replaced by the flat, always-visible switch
> model (`Off` / `Cloudflare` / `WebLLM` / `Your own key`), no forced post-upload gate — now
> master `DATASCOPE.md` §5.1 and Decision Record D2/D71/D72. Items 3–4 (viewer strip absent,
> strip scope map-only) still hold; read 1–2 as history.

1. **Data-handling posture: two options.** Keep-on-device / allow-cloud, three-mode AI
   consent nested under "allow cloud" (§4). Not the three-flat-options alternative.
2. **Re-ask cadence: every upload, for now.** No stored posture/settings-pane memory in
   this pass — the gate reappears on every fresh upload (§4). Explicitly revisitable later,
   not closed permanently.
3. **Viewer-mode strip: fully absent.** Viewer mode (J4) is consumption-only — no strip, not
   even a reduced read-only one. `[export the report]` and `[start my own session]` are the
   present actions (§2 J4, §3).
4. **Strip scope: map only.** The options strip lives above the map (the selection surface)
   only — not above other tabs, which carry their own in-tab actions (SQL's run/pin, Profile's
   insight feed, etc.). The palette remains the cross-cutting escape hatch everywhere.

These are now load-bearing for the mock (§6) and for the formal-pass fold — not re-open
without a reason.
