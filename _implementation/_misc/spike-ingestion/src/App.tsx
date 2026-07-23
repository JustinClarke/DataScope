import { useCallback, useEffect, useRef, useState } from 'react';
import {
  initDuckDB,
  runFile,
  type InitResult,
  type RunResult,
} from './duckdb';

// Structured mirror of everything on screen, so an automated driver
// (Playwright) can read exact numbers without scraping the DOM.
declare global {
  interface Window {
    __SPIKE__: {
      init: InitResult | null;
      initError: string | null;
      runs: RunResult[];
      ready: boolean;
    };
  }
}

function fmtMs(ms: number) {
  return `${ms.toFixed(1)} ms`;
}
function fmtBytes(b: number | null) {
  if (b == null) return 'n/a';
  const mb = b / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export default function App() {
  const [init, setInit] = useState<InitResult | null>(null);
  const [initErr, setInitErr] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.__SPIKE__ = { init: null, initError: null, runs: [], ready: false };
    initDuckDB()
      .then((r) => {
        setInit(r);
        window.__SPIKE__.init = r;
        window.__SPIKE__.ready = true;
      })
      .catch((e) => {
        const msg = String(e?.stack || e);
        setInitErr(msg);
        window.__SPIKE__.initError = msg;
        window.__SPIKE__.ready = true;
      });
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const r = await runFile(file);
      setRuns((prev) => [...prev, r]);
      window.__SPIKE__.runs.push(r);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('runFile failed', e);
      alert(`runFile failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) void handleFile(f);
    },
    [handleFile]
  );

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 900 }}>
      <h1>DuckDB-Wasm ingestion harness</h1>

      <section style={{ marginBottom: 20 }}>
        <h2>Environment</h2>
        {!init && !initErr && <p>Initializing DuckDB…</p>}
        {initErr && (
          <pre style={{ color: 'crimson', whiteSpace: 'pre-wrap' }}>{initErr}</pre>
        )}
        {init && (
          <ul>
            <li>
              <b>crossOriginIsolated:</b> {String(init.env.crossOriginIsolated)}
            </li>
            <li>
              <b>SharedArrayBuffer available:</b>{' '}
              {String(init.env.sharedArrayBuffer)}
            </li>
            <li>
              <b>Selected bundle:</b> {init.bundle.selected}{' '}
              {init.bundle.threaded ? '(multi-threaded)' : '(single-threaded)'}
            </li>
            <li>
              <b>Cold init:</b> {fmtMs(init.coldMs)}
            </li>
            <li>
              <b>Platform features:</b>{' '}
              <code>{JSON.stringify(init.env.features)}</code>
            </li>
          </ul>
        )}
      </section>

      <section style={{ marginBottom: 20 }}>
        <h2>Load a file</h2>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? '#0a7' : '#999'}`,
            borderRadius: 8,
            padding: 40,
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? '#eafaf3' : '#fafafa',
          }}
        >
          {busy ? 'Working…' : 'Drop a .csv or .parquet file here, or click to choose'}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.parquet"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </section>

      <section>
        <h2>Runs</h2>
        {runs.length === 0 && <p>No files loaded yet.</p>}
        {runs.map((r, i) => (
          <table
            key={i}
            style={{ borderCollapse: 'collapse', marginBottom: 16, fontSize: 14 }}
          >
            <tbody>
              {[
                ['file', r.fileName],
                ['file size', fmtBytes(r.fileBytes)],
                ['rows', r.rows.toLocaleString()],
                ['columns', String(r.cols)],
                ['register buffer', fmtMs(r.registerMs)],
                ['ingest (CREATE TABLE)', fmtMs(r.ingestMs)],
                ['count(*)', fmtMs(r.countMs)],
                ['SUMMARIZE', fmtMs(r.summarizeMs)],
                ['engine memory (duckdb_memory)', fmtBytes(r.engineMemBytes)],
                ['JS heap before', fmtBytes(r.jsHeapBeforeBytes)],
                ['JS heap after', fmtBytes(r.jsHeapAfterBytes)],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td
                    style={{
                      border: '1px solid #ddd',
                      padding: '4px 8px',
                      fontWeight: 600,
                    }}
                  >
                    {k}
                  </td>
                  <td style={{ border: '1px solid #ddd', padding: '4px 8px' }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </section>
    </div>
  );
}
