# 04 Inspector Polish

## Scope

Add a subtle visual indicator to the collapsed inspector drawer when it contains active content (a selection or query result).

## Implementation

1. In `src/features/inspector/InspectorDrawer.tsx`, check `hasInfoContent` when the drawer is collapsed (`!open`).
2. If true, render a small, glowing accent-colored dot next to the "Inspector" label in the collapsed header strip.

## Rationale

The inspector drawer contains critical context (selection details, query results) but its collapsed state is very subtle. Users might not realize they have a result waiting or that their selection updated the inspector. A non-intrusive indicator dot signals the presence of content without forcing the drawer open or stealing focus.
