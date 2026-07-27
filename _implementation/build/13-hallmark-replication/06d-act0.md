# V6d — Act 0

**Tier:** v0.69 (the hallmark visual replication, D71 execution) · **Master spec:** §19 (the
v0.69 subsection, V6d row + its "Act 0's register" paragraph) and §13.3 (the act model) ·
**Decision rows:** D71 (names the five signed-off mocks as the visual reference — this leaf
charters nothing new) · **Locked system:** `.hallmark/design.md`, § Variants ·
**Depends on:** V6a (shipped 2026-07-25 — Act 0 mounts the status blocks V6a re-voiced). Fourth
of the five leaves V6 was split into.

This leaf lands **before** any `src/` code for this phase, per §19's binding constraint.

## Objective

Act 0 is the one screen a user meets **before** the instrument exists. Everything V1–V6c did was
to a surface that only appears once you already have data; this is the surface that decides
whether you give it any.

What ships today is a placeholder W6 wrote deliberately, and said so in place:
`WorkbenchShell.tsx`'s `Welcome` is a centred `max-w-2xl` stack with an `h1`, one sentence of
lede, and `<IngestionPanel />` — carrying the code comment *"functional-first on the existing
design tokens (the signed-off hallmark mock `welcome-act0.html` is content/copy reference only,
same precedent W4 set for the map)."* V6d retires that comment: the mock is the composition
reference **for real** from here.

The register question that made this leaf wait was settled by human call on 2026-07-25 and is
recorded in three places already (`design.md` § Variants, master §19, this folder's README):
**the composition ports, the Specimen register does not.** This leaf does not re-open it. It is
the build.

## Scope calls

**1. The composition is built where the content already lives — `IngestionPanel` — not in a new
Act-0-only component.** Since the W8 cutover `IngestionPanel` has exactly one mount in the whole
app: `Welcome` in `WorkbenchShell.tsx` (verified — the only other references to the name are two
doc comments in `TableList.tsx`/`ExplorerPanel.tsx`). Its layout therefore *is* Act 0's layout.
A separate welcome component would either duplicate the ingest state machine — six `useState`
hooks, five async callbacks, the format/size/relay/redo branches — or thread every one of them
back through props to reach the same three controls. So the mock's `.ingest` grid is built in
place, and `Welcome` supplies the masthead, the section frames and the footer **around** it.

**2. The mock's section 03 copy is rewritten, because it describes an app this one deliberately
is not.** `welcome-act0.html` promises *"Once something's in, we'll ask exactly one thing — how
you'd like to work."* §13.3 and §5.1 are explicit that there is **no forced gate**, and W6 built
exactly that: AI off by default, a capable-device WebLLM pre-select, a "Configure workspace"
affordance, no blocking question. Shipping the mock's line would have the front door promise a
prompt the product never shows. The section keeps its slot, its rhythm and its role as the
page's closing beat; its copy becomes what W6 actually built. Same posture V3 took when it
repurposed the mock's role-badge slot rather than fabricating a table-role classification the
codebase does not have.

**3. The one-shot entrance reveal does not port.** The mock stages its three sections in on load
(`.reveal` / `@keyframes reveal-up`, 60/140/220ms). `design.md` § Motion is one line: *"Reveal
pattern: none. This is an instrument. Content does not fade in on scroll."* The mock's is a
load-time entrance rather than a scroll-triggered one, so a literal reading leaves a gap — but
honouring the letter while breaking the intent is precisely the drift § Drift policy exists to
stop, and nothing else in this app animates its entrance. Act 0 ships static. No amendment, no
exception.

**4. No token is added. Two tokens V1 declared and nothing has ever used become live.**
`--text-display-s` (`clamp(1.4rem, 2vw + 1rem, 1.9rem)`) and `--color-footer` are both declared
in `theme.css` and `tokens.css` in both registers, and neither appears anywhere in `src/` — dead
since the V1 port. They are exactly what this page needs: the headline step and the footer band.
The mock's own `--text-display` (2.75–5.25rem) is more than 3× the app's largest step, and
§ Typography forbids inflating the scale; against a 0.75rem body, 1.9rem already reads as
display scale in this instrument. The editorial quality comes from **rhythm** (`--space-xl`
section padding), **measure** (`max-width` in `ch`) and the mono eyebrows — not from a bigger
number.

**5. No amber-filled button appears on Act 0.** § CTA voice reserves the amber fill for
`.btn-primary` and the ranked top action in the options strip; the mock's ink-filled `Fetch →`
has no counterpart in the HUD register. It becomes the **secondary / HUD button** voice —
`--color-panel` face, 1px `--color-rule` border, mono `--text-md`, `--color-ink-2` text, hover
lifting text to `--color-ink` and border to `--color-rule-hi` — the same voice V2 gave the title
bar's controls and V5 the options strip's. The page's primary affordance is the dropzone, which
is a large target rather than a button. Amber on Act 0 is therefore four things: the wordmark's
second half, two of the grid mark's nine cells, the dropzone's drag-active border, and the
samples' hover/focus hairline. All four are conditional or hairline-thin, so § Accent budget's
~5% is satisfied by a wide margin.

**6. The dropzone loses its 32px centred cloud icon and left-aligns.** The mock's dropzone is a
typographic block — title, hint, nothing else. § Per-page allowances: *"App pages MUST NOT use
enrichment. Function carries the page."* A large decorative glyph centred on the app's front
door is what V6e's slop gate is for. Every behaviour is untouched: same drag/drop, keyboard,
click-to-browse and folder-picker handlers, same `accept` list, same `disabled` semantics, same
`onFiles` contract.

**7. All five samples ship as the typographic list — not the mock's three.** `SAMPLE_MANIFEST`
carries five real entries; the mock's iris / NYC taxi / movie-ratings rows are illustrative and
none of them exists in this app. Each real entry becomes one `.samples__item`-equivalent row:
label, em-dash, its own `description`, and a mono `→`, over a hairline that goes amber on hover
and focus. They stay `<button>`s — they start an ingest, not a navigation — rather than the
mock's `<a href="#">`.

**8. The masthead wordmark is the shipped `TitleBar` treatment, one step up.** `Data` in
`--color-ink`, `Scope` in `--color-active` — what V2 shipped and V6c ported into the export, not
`design.md` § What pages MUST share's "accent-coloured dot," which describes something V2 did
not build. V6c already flagged that stale sentence and declined to fix it in passing; V6d
declines for the same reason, and it stays V6e's business. Act 0 sets it at `--text-2xl` against
the title bar's `--text-xl`, since the front door is the one place the wordmark is the subject
rather than chrome. The hairline grid mark sits inline before it — 3×3, `--color-ink` frame,
`--color-rule` cell hairlines, cells 1 and 5 amber — built with utility classes on the element
rather than a new global class, because it appears exactly once.

**9. Act 1 inherits all of it, unchanged and on purpose.** `Act0` and `Act1` both render
`<Welcome />` and that stays true. W6's reasoning holds verbatim: Act 1 *"is this same content
staying mounted while the DuckDB worker finishes booting in the background, not a different
screen,"* and `TelemetryPanel` already renders honest phase labels inside it. No second progress
screen, no divergent composition.

**10. Out of scope, drawn explicitly.** The status surfaces Act 0 mounts —
`TelemetryPanel`, the error / aggregate-warning / size banners, `SummaryToast`,
`FormatRejectionModal`, `TableList`, the redo offer — keep the voice V6a gave them and are only
**re-slotted**, never re-styled here; re-voicing them twice in one tier is how a sweep becomes a
rewrite. Every conformance measurement (contrast, slop-test gate, live-browser verification,
residual-zero re-measurement) is **V6e's**, including this page's. And no behaviour changes
anywhere: not one handler, state field, ingest path, `accept` list or aria-label.

## The composition

Mock → shipped, section by section. Left column is `welcome-act0.html`'s own class names.

| Mock | Ports as | Register / notes |
| :--- | :--- | :--- |
| `.masthead__issue` | The privacy line, `.micro` | `--color-ink-3`; copy unchanged |
| `.gridmark` + `.masthead__wordmark` | Grid mark + `Data`/`Scope` wordmark | `--text-2xl`, Geist 600, `-0.01em`; amber on `Scope` and 2 of 9 cells |
| `.masthead__rule` (double hairline) | `--color-rule` over `--color-rule-2` | The mock's ink+rule pair, on translucent rules |
| `.specimen__num` (`01 — Local-first.`) | Section eyebrow, `.micro` | `--color-ink-3` |
| `.specimen__h1` | `--text-display-s`, `-0.02em` | § Theme's gate-heading tracking |
| `.specimen__lede` | `--text-lg`, `--color-ink-2`, `max-w-[52ch]` | V6c's prose step, same reasoning |
| `.specimen__h2` | `--text-2xl`, `-0.02em`, `max-w-[20ch]` | |
| `.specimen` (`border-bottom`, generous padding) | `--color-rule` divider, `--space-xl` block padding | Last section drops its divider |
| `.ingest` grid (`1.3fr 1fr`, drop / url+samples) | Same areas at `min-width: 60rem` | Single column below |
| `.ingest__label` ×3 | The existing `<h2>`s, re-voiced `.micro` | Headings kept — the outline is real; only the voice and wording change |
| `.dropzone` | Left-aligned, dashed `--color-rule`, `--color-card` face | Drag-active → solid `--color-active`; icon dropped (scope call 6) |
| `.urlform` | Input on `--color-canvas` + secondary button | Scope call 5 |
| `.samples__item` ×3 | All five manifest entries as hairline rows | Scope call 7 |
| `.foot` (Ft2) | Identity line on `--color-footer` | Not a D26 surface — that row governs *exported* reports and hosted shares, not the app's own front door, so no attribution link is added |
| `.reveal` / `reveal-up` | **Not ported** | Scope call 3 |
| Specimen palette, Fraunces, violet accent | **Not ported** | Resolved 2026-07-25; `design.md` § Variants |

Page surface is `--color-canvas` — the stage. Act 0 is chrome-free by §13.3 (no `data-region`
mounts), so it is all content and sits on the content surface, not the `--color-void` board the
shell floats on.

## Spec

### `src/app/WorkbenchShell.tsx`

Only `Welcome` changes; `Act0`, `Act1`, `TabHost`, `ShellGrid` and every hook are untouched.

- The W6 comment above `Welcome` is updated — the mock is no longer "content/copy reference
  only" for this surface. Its Act-1 paragraph (scope call 9) and its
  `navigateToPostIngestLanding()` note stay.
- `Welcome` becomes the editorial frame: `min-h-svh` on `--color-canvas`, a centred masthead
  (privacy `.micro` line, grid mark + wordmark, double rule), a `max-w-[74rem]` main holding the
  three sections, and the footer band.
- Section 01 — eyebrow `01 — Local-first.`, `h1` *"Nothing leaves your machine."*, the mock's
  lede verbatim. This is the node the existing Act-0/Act-1 tests match on (`/Nothing leaves your
  machine/`), so those assertions stay true without being edited.
- Section 02 — eyebrow `02 — Bring data.`, `h2` *"Drop a file, paste a link, or start from a
  sample."*, then `<IngestionPanel />`.
- Section 03 — eyebrow `03 — Then it's yours.`, `h2` and lede per scope call 2: AI is off until
  the user turns it on, and everything before that runs on their own machine.
- Footer — `DataScope · a local-first data workbench` on `--color-footer`, mono `--text-sm` in
  `--color-ink-3` with the name lifted to `--color-ink`. Not `.micro`: the mock's Ft2 row is
  normal-case with the name emphasised, and uppercasing it would flatten the wordmark's own
  casing. The mock's `ideation draft, <year>` line does not ship — a live product does not label
  itself a draft, and a `new Date()` in a render path is needless non-determinism in tests.

### `src/features/ingestion/IngestionPanel.tsx`

Layout only. Every hook, callback, branch and piece of state is byte-identical.

- The returned tree becomes the mock's `.ingest` grid: `grid gap-(--space-lg)`, and at
  `min-width: 60rem` a `1.3fr 1fr` two-column with `drop` spanning both rows against `url` over
  `samples` — expressed with Tailwind's `lg:` column/row placement rather than named grid areas.
- The two existing `<h2>`s are joined by a third above the dropzone; all three become
  `.micro text-(--color-ink-3)` and reword to `File, folder, or .zip` / `From a URL` /
  `Or try a sample`.
- Everything the grid does not contain — telemetry, the four status blocks, the relay
  disclosure, the redo offer, the summary toast, `TableList`, the rejection modal — moves below
  the grid in one stacked column, in the order it renders today, unstyled by this leaf
  (scope call 10).

### `src/features/ingestion/DropZone.tsx`

- Left-aligned column, `--space-xl`/`--space-lg` padding, `min-h-48`, `--color-card` face,
  1px dashed `--color-rule`, `--radius-xs`.
- Title at `--text-lg` in `--color-ink`; hint at `--text-base` in `--color-ink-3`; the
  `choose a folder` button keeps its underline and lifts to `--color-ink` on hover.
- Drag-active: solid `--color-active` border on `--color-elev`. Hover: `--color-rule-hi`.
  Disabled: unchanged (`opacity-50`, `cursor-not-allowed`, `tabIndex={-1}`).
- `UploadCloud` import removed with its usage — an orphan the change itself creates.

### `src/features/ingestion/UrlInputForm.tsx`

- Input on `--color-canvas` inside a `--color-rule` border at `--radius-xs`, `--text-base`,
  placeholder `--color-ink-3`; `Link2` glyph kept in `--color-ink-3`.
- Submit becomes the HUD secondary button (scope call 5), label `Fetch` unchanged.
- The mock's `.urlform__help` line — *"A CSV, an API endpoint, or a public sheet."* — ships as a
  static hint under the row in `--color-ink-3`. It is the one element the mock has that the
  shipped form lacks, and it is honest copy about what the field takes.

### `src/features/ingestion/SamplePicker.tsx`

- The 2-column card grid becomes a stacked list of full-width `<button>`s: label in
  `--color-ink` at `--text-base`, an em-dash, `description` in `--color-ink-3`, and a mono `→`
  in `--color-ink-3`, over a `border-b border-(--color-rule)` that goes `--color-active` on
  hover and focus.
- `onSelect` / `disabled` contracts unchanged; the label stays its own text node so
  `getByText('Titanic Passengers')` keeps resolving.

### Documents

**None.** `design.md` § Variants, master §19's V6d row and its "Act 0's register" paragraph, and
this folder's README already describe this work correctly and completely — the resolution was
recorded on 2026-07-25 ahead of the build. No decision changes, no departure is added (the count
stays at four), and no token is introduced, so there is nothing to land master-first. The only
doc edits are bookkeeping: this folder's README per-phase-leaves list, and BUILD-ORDER.md's row
and log.

## Files

Modified: `src/app/WorkbenchShell.tsx`, `src/app/WorkbenchShell.test.tsx` (additive),
`src/features/ingestion/IngestionPanel.tsx`, `src/features/ingestion/DropZone.tsx`,
`src/features/ingestion/UrlInputForm.tsx`, `src/features/ingestion/SamplePicker.tsx`, this
folder's `README.md`, `_implementation/status/BUILD-ORDER.md`.

Unchanged: `_implementation/DATASCOPE.md`, `design.md`, `tokens.css`, `src/app/theme.css`,
`src/features/ingestion/TelemetryPanel.tsx`, `TableList.tsx`, `SummaryToast.tsx`,
`FormatRejectionModal.tsx`, `samples.ts`, `src/features/ingestion/IngestionPanel.test.tsx`, and
everything under `src/features/**` outside the four ingestion components above.

## Dependencies

V6a (shipped 2026-07-25) — Act 0 mounts the error and warning blocks V6a moved onto
`--color-error` / `--color-warn`, and this leaf inherits them rather than touching them. No
dependency on V6b (Act 0 has no chart) or V6c (no export surface).

## Acceptance criteria

- [ ] `Welcome` renders the mock's five-part editorial structure — masthead (privacy line, grid
      mark + wordmark, double rule), three numbered sections, footer — on `--color-canvas`
- [ ] Act 0 stays chrome-free: no `data-region` element mounts (the existing test still passes)
- [ ] The `01` section carries `Nothing leaves your machine.` as its `h1`, so both the Act-0 and
      Act-1 assertions in `WorkbenchShell.test.tsx` pass **unedited**
- [ ] The `03` section's copy describes the shipped no-forced-gate model, and the string
      "ask exactly one thing" appears nowhere in `src/`
- [ ] The ingest grid places drop / url / samples in the mock's arrangement at `lg:` and stacks
      below it
- [ ] Zero `#rrggbb` literals and zero named CSS colours in the five touched components
- [ ] No `--text-display`-scale value is introduced: the headline uses `--text-display-s`, and
      `theme.css`/`tokens.css` are byte-identical to their pre-V6d state
- [ ] `--text-display-s` and `--color-footer` each have at least one live use in `src/` after
      this leaf (they had none before)
- [ ] No amber fill on any button; amber appears only as wordmark, grid-mark cells, drag-active
      border and sample hover/focus hairline
- [ ] No entrance animation, no `@keyframes`, no staggered delay anywhere in the five components
- [ ] No pictographic emoji; the only marks are the mono `→` and the CSS grid mark
- [ ] Every pre-existing test in `IngestionPanel.test.tsx` passes **unmodified** — the guard that
      V6d changed voice and arrangement, not behaviour
- [ ] No file outside the Files list changed — `git status` confirms
- [ ] `tsc -b` clean; full suite green (baseline: 135 files / 1327 tests); `oxlint` clean apart
      from the pre-existing unrelated `_misc/spike-webllm/smoke.mjs` warning

**Not criteria here, by design:** measured contrast of Act 0's surfaces, the slop-test gate and
live-browser verification are V6e's, exactly as they were for V6a–V6c. V6d's claim is that the
page is composed from the system's own tokens; whether those tokens clear their gates is a
question about the token layer, answered once at V1 and re-audited at V6e.

## Test plan

- **`WorkbenchShell.test.tsx`** — additive. The three existing Act-0/Act-1/viewer cases stay
  verbatim and are the regression guard. New: the masthead renders the split wordmark with
  `Scope` on `--color-active`; the three section eyebrows render; the `03` section's copy is the
  shipped no-gate wording; the footer renders; Act 1 renders the identical composition (same
  eyebrows, same wordmark) as Act 0.
- **`IngestionPanel.test.tsx`** — untouched. Its 20-odd cases drive the real flows through
  `input[type="file"]`, `getByLabelText('API URL')`, `getByText('Fetch')`,
  `getByText('Titanic Passengers')` and the `Remove`/`Undo`/`Refresh` labels; all five survive
  the restyle by construction, and their passing unmodified is the acceptance criterion above.
- Nothing else in the suite renders these four components — verify with a search before
  starting rather than assuming.

## Definition of done

The screen a user meets before the instrument exists looks like the instrument. Act 0 carries
`welcome-act0.html`'s editorial composition — masthead and grid mark, numbered sections,
display-scale headline, generous rhythm, the drop / URL / samples arrangement, the footer band —
rendered entirely in the HUD register on the app's own tokens, with no second font family, no
light→dark seam at ingest, and no entrance animation. Its copy is true of the app that ships:
the front door promises no question the product never asks. Two tokens V1 declared and nothing
used are now doing the job they were named for, and no token was added. Ingest behaviour is
untouched, proven by `IngestionPanel.test.tsx` passing unmodified. `tsc -b` / suite / `oxlint`
clean.
