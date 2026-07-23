import { defineConfig } from 'vite';

// COOP + COEP put the page into crossOriginIsolated state, which we need for two
// independent reasons here:
//   1. DuckDB-Wasm's threaded (coi) bundle needs SharedArrayBuffer.
//   2. performance.measureUserAgentSpecificMemory() is only exposed when isolated —
//      it is the truthful cross-heap memory signal for kill-criterion (a).
// We use COEP: credentialless rather than require-corp so WebLLM's multi-gigabyte
// cross-origin model-shard fetches from the MLC/HuggingFace CDN load without every
// response needing an explicit CORP header.
export default defineConfig({
  plugins: [
    {
      name: 'coop-coep-headers',
      configureServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
          next();
        });
      },
    },
  ],
  optimizeDeps: {
    // DuckDB ships its own workers + multi-MB wasm; don't let Vite rewrite them.
    // WebLLM similarly pulls a wasm runtime it fetches itself.
    exclude: ['@duckdb/duckdb-wasm', '@mlc-ai/web-llm'],
  },
  server: {
    port: 5199,
    host: '127.0.0.1',
    // evalRunner.ts imports the product's real classifier/schemaPrune/eval
    // modules from ../../app so the WebLLM harness scores against the exact
    // same pipeline logic and labeled question set as the other two D40
    // providers (D58) — those live outside this project's root.
    fs: { allow: ['.', '../app/src', '../app/eval'] },
  },
});
