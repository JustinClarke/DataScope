# dsps-validator

A validator/parser for **DSPS — the DataScope Profile Spec**: an open, versioned
JSON document describing a dataset's schema, inferred types, profile
aggregates, and structural facts. No data rows, ever — DSPS is built for a
consumer that should never see the underlying data.

This package has no dependency on DataScope's own application source. It is
the independent reference implementation of `dsps.schema.json` (shipped
alongside it here), so a third-party tool can consume a `.dsps` document
without reading DataScope's repo.

## Usage

```ts
import { parseDsps, validateDsps } from 'dsps-validator';

const result = parseDsps(JSON.parse(rawJson));
if (result.ok) {
  console.log(result.doc.tables.map((t) => t.tableName));
} else {
  console.error(`Can't read this DSPS document (saw ${result.seenVersion})`, result.errors);
}
```

`validateDsps(input)` runs structural validation alone (no version-compat
check) and returns `{ valid, errors }`. `parseDsps(input)` validates, then
checks the document's major version against this library's own `DSPS_VERSION`
— a document from a newer major is reported by version rather than force-cast,
per DSPS's compatibility rule: a version mismatch surfaces, it never fails
opaquely. A document within the current major parses even if it carries
fields this library predates (forward-compatible).

## Files

- `src/index.ts` — the validator/parser and the `DspsDocument` TypeScript types.
- `dsps.schema.json` — the published JSON Schema (draft 2020-12) this
  library's structural checks mirror, for tools that want to validate with
  their own JSON-Schema engine instead.
