# UI redesign concept — VS Code-style workspace

**Status: concept note, not spec.** Captured from a design conversation 2026-07-22. Nothing
here is decided — when it's time, this goes through the formal pass (design-reviewer →
triage → synthesizer, master-first into DATASCOPE.md) like any cross-cutting design change.
Sequencing: after the current 06-ai infrastructure work lands; the pipeline/router/provider
seams are exactly what this UI plugs into, and none of this changes what they need to do.

## The problem

The drop/choose-dataset opening is good. Everything after it is overwhelming: too much
text, too many questions, too much SQL on screen at once. A new user wouldn't know what
to do; even a data analyst could get overwhelmed. This is a feature-density and
journey-curation problem more than a layout problem — but the layout is the vehicle for
fixing it.

## The proposed shape

Three-pane, VS Code-style:

| Pane | Contents |
| :--- | :--- |
| **Left** | Ingested tables, file-explorer style — the "what am I working on" anchor |
| **Middle** | The workspace: feature buttons (Profile, SQL, Charts, Data Quality, …) and a tab strip. Outputs open as tabs **on demand** — profiling results, query results, charts, insights — never all at once |
| **Right** | AI chat. Optional, for people who want it; the deterministic path never depends on it |

## Principles

1. **AI outputs are visual/structural artifacts, not text-only.** ERDs, charts,
   data-quality views, suggested transformations — the AI opens a tab and drops its
   output there when the answer isn't words. Users iterate on the artifact and can
   export it to give feedback to whoever supplied the dataset.
2. **Nothing built gets thrown away.** Every deterministic module is re-homed from a nav
   destination into a middle-canvas tab — a rewire for better UX, not a rebuild.
3. **AI generates specs, not artifacts.** It introspects what the app already has
   (schema, columns, available chart templates) and fills in existing contracts —
   `ChartSpec` through the same chart translator, ERD through the join-graph module.
   Recharts is bundled anyway; chart generation is light because it's spec-filling,
   not code generation.
4. **Privacy and weight are unchanged.** Data stays in DuckDB-Wasm; the AI sees the
   same pruned structural facts it already does (D37/D58); cloud-first → WebLLM
   handoff stays the v0.25 plan (Cloudflare answers while WebLLM downloads, then
   client-side takeover). A rewire of where things render touches zero privacy surface.

## Honest caveats / open questions

- **This supersedes part of D68/D69.** The 12→4 intent-group nav and the
  Blueprint-forward opening as *the* post-ingest surface get rethought — the three-pane
  model is arguably the better answer to the same overwhelm problem, but that's a real
  design decision that needs to be made explicitly, not drifted into.
- **The middle button menu IS the journey curation.** Which buttons exist and in what
  order is the whole game — get it right and the layout works; get it wrong and users
  still don't know what to click first. Worth sketching/wireframing before any code.
- **Curation trades flexibility for clarity.** A directed journey bets that its
  workflows cover the real use cases; someone who wants to jump straight to a
  data-quality audit or schema design shouldn't be locked out of their funnel.

## Next step (when the time comes)

Spec it master-first in DATASCOPE.md as its own decision — the layout, the
"AI outputs are visual artifacts in tabs" principle, and what happens to the Blueprint
opening — then mirror into the build tree, via a design-reviewer pass since it's
cross-cutting.
