import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// COOP/COEP unlock SharedArrayBuffer for DuckDB-Wasm's threaded build (ADR-001).
// Not load-bearing — DuckDB-Wasm falls back to its single-threaded `eh` bundle
// without them (Phase-1 ingestion spike, DATASCOPE.md §21) — but set them
// wherever we control headers so threaded queries are the common case.
// COEP is `credentialless` rather than `require-corp`: the in-browser WebLLM
// model shards come from a cross-origin CDN that does not send CORP headers, and
// credentialless lets those fetches through while keeping crossOriginIsolated
// true for DuckDB's threaded build.
const crossOriginIsolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // DuckDB-Wasm ships its own web workers and multi-MB .wasm files; letting
    // Vite's dependency pre-bundler rewrite them breaks worker loading. WebLLM
    // likewise fetches its own wasm runtime at load time.
    exclude: ['@duckdb/duckdb-wasm', '@mlc-ai/web-llm'],
  },
  server: {
    headers: crossOriginIsolationHeaders,
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
})
