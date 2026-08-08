# 05 Map Overview Home

## Scope

Provide a permanent "home" action by making the application logo clickable, routing the user to the dataset overview (the map tab).

## Implementation

1. In `src/app/TitleBar.tsx`, wrap the "DataScope" wordmark in a `<button>`.
2. On click, call `useTabsStore.getState().openTab('map', MAP_TAB_SUBJECT)`.

## Rationale

Once users navigate deep into the workspace (querying, profiling, charting), there is no obvious way to return to the high-level dataset summary (the Blueprint or ERD) other than finding the "Map" tab in the tab strip, which might be scrolled out of view or closed. A clickable logo is a standard pattern for returning "home" or to an overview.
