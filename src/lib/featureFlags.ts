// Build-time feature flags. The join graph is a confidence-labeled inference
// slice governed by its own quality/ambiguity/timebox/performance kill criteria;
// a no-graph variant is maintained in parallel so the slice can be cut without
// breaking the product. Turning this off is the cut path: the sidebar entry
// disappears, the post-ingest overview falls back to its table-grid rendering,
// and the structure report and AI-context block emit schema only — every one a
// working product, not a broken one.
//
// Read once here so the fallback is a single toggle. `import.meta.env` lets a
// build or an env override force the graph off without a code change; it
// defaults on.
const RAW = import.meta.env.VITE_JOIN_GRAPH as string | undefined;

export const JOIN_GRAPH_ENABLED: boolean = RAW === undefined ? true : RAW !== 'false' && RAW !== '0';
