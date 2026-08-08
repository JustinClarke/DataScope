# 03 Collapsible AI Pane

## Scope

Lift the AI pane's collapse state from component-local state to the shared, persisted layout store.

## Implementation

1. Add `aiPaneCollapsed` to `stores/layout.ts`.
2. Update `src/features/ai/AIPane.tsx` to read and toggle its collapse state using `useLayoutStore` instead of a local `useState`.

## Rationale

Centralizing layout state in a persisted store ensures that if a user collapses the AI pane to focus on other tasks, it remains collapsed across page reloads. The AI pane already had a visual collapsed state (a thin strip with a ChevronsLeft icon), so this change is purely structural to integrate it into the global layout management.
