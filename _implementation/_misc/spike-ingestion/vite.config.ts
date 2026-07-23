import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// COOP/COEP headers put the page into a "cross-origin isolated" state.
// That state is a hard prerequisite for SharedArrayBuffer, which the
// multi-threaded (pthread) WebAssembly build of DuckDB needs. Without these
// two headers the browser refuses to expose SharedArrayBuffer, so DuckDB can
// only load its single-threaded build.
//
// Set NO_COI_HEADERS=1 to deliberately start the server WITHOUT these headers,
// so we can observe the non-isolated fallback path.
const sendCoiHeaders = process.env.NO_COI_HEADERS !== '1';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'coop-coep-headers',
      configureServer(server) {
        server.middlewares.use((_req, res, next) => {
          if (sendCoiHeaders) {
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
          }
          next();
        });
      },
      // The preview server serves the production build (hashed, long-lived
      // assets) so we can measure realistic warm-cache behavior.
      configurePreviewServer(server) {
        server.middlewares.use((_req, res, next) => {
          if (sendCoiHeaders) {
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
          }
          next();
        });
      },
    },
  ],
  // DuckDB ships its own web workers and multi-megabyte .wasm files; letting
  // Vite's dependency optimizer rewrite them causes broken worker loads.
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
  },
  server: {
    port: 5188,
  },
});
