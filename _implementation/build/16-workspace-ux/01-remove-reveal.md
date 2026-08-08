# 01 Remove Reveal

## Scope

Remove the `WorkbenchShellReveal` intermediate page and revert the app to the direct `Welcome → Shell` flow (the production `WorkbenchShell`).

## Implementation

1. Revert `src/app/App.tsx` to import and render `WorkbenchShell` instead of `WorkbenchShellReveal`.
2. Delete `src/app/WorkbenchShellReveal.tsx` and its test file.

## Rationale

The Reveal flow was a prototype for a first-run onboarding experience (see `backlog/first-run-analyst-reveal.md`). The UX audit identified that the Explore/Workspace mode framing created unnecessary cognitive load. Removing the reveal and adopting VSCode-style collapsible panels provides a cleaner, more standard IDE-like experience while retaining all functionality.
