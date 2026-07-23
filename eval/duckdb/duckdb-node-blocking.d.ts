// No shipped `.d.ts` resolves for this exact `.cjs` subpath under
// "moduleResolution": "bundler" (duckdb-wasm's own types live one level up,
// without the extension our Node-ESM runtime import needs) — a minimal local
// shape for just the four bindings this harness uses, read off
// `dist/types/src/targets/duckdb-node-blocking.d.ts` and
// `dist/types/src/bindings/{bindings_base,connection}.d.ts`.
declare module '@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs' {
  import type { Table } from 'apache-arrow';

  export enum LogLevel {
    NONE = 0,
    CRITICAL = 1,
    ERROR = 2,
    WARNING = 3,
    INFO = 4,
    DEBUG = 5,
  }
  export class ConsoleLogger {
    constructor(level?: LogLevel);
  }
  export const NODE_RUNTIME: unknown;

  export class DuckDBConnection {
    query<T = Record<string, unknown>>(text: string): Table<T>;
    close(): void;
  }

  export interface DuckDBNodeBindings {
    instantiate(mainModule: string, pthreadWorker?: string | null): Promise<void>;
    connect(): DuckDBConnection;
    dispose?(): void;
  }

  export function createDuckDB(
    bundles: unknown,
    logger: ConsoleLogger,
    runtime: unknown,
  ): Promise<DuckDBNodeBindings>;
}
