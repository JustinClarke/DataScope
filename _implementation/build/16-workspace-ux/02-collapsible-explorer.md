# 02 Collapsible Explorer

## Scope

Make the left-hand explorer panel collapsible to a thin activity bar, similar to VSCode.

## Implementation

1. Create a new `stores/layout.ts` Zustand store to hold shell-level layout state (e.g., `explorerCollapsed`), persisted to `localStorage`.
2. In `WorkbenchShell.tsx`, add an `ExplorerActivityBar` component that renders a thin (~40px) strip with icon buttons (Table, Search, ShieldCheck) when the explorer is collapsed.
3. Wire the `ShellGrid` to conditionally render either the full `ExplorerPanel` (with its resize handle) or the `ExplorerActivityBar` based on the store's state.
4. Add a global keyboard shortcut (`⌘B` / `Ctrl+B`) to toggle the explorer's collapse state, matching VSCode conventions.

## Rationale

The explorer panel is useful for navigation but takes up valuable horizontal space when focusing on query writing or chart building. A collapsible activity bar provides quick access to re-expand the panel without permanently consuming space. Persisting the state ensures the workspace remembers the user's preferred layout.
