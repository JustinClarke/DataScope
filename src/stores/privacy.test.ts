// §22 privacy checklist, exercised at the state layer (01-foundation/02-state-management.md
// test plan): populate a dataset, "reload," and confirm localStorage holds exactly what the
// 07c-amended §22 allows — settings, plus the datasets registry's catalog metadata — and never
// row content. IndexedDB isn't asserted here — nothing in this store layer opens a database yet
// (DuckDB's OPFS staging is services/opfsStaging.ts, not this store).
import { beforeEach, describe, expect, it } from "vitest";
import { useByokKeyStore } from "./byokKey";
import { DATASETS_STORAGE_KEY, useDatasetsStore } from "./datasets";
import { SETTINGS_STORAGE_KEY, useSettingsStore } from "./settings";
import type { Dataset, TableRegistryEntry } from "../types";

const dataset: Dataset = {
  id: "ds-1",
  name: "sensitive-customers.csv",
  sourceType: "file",
  tableNames: ["customers"],
  ingestedAt: "2026-07-19T00:00:00.000Z",
};

const table: TableRegistryEntry = {
  id: "tbl-1",
  tableName: "customers",
  datasetId: "ds-1",
  origin: "file",
  rowCount: 500,
  columnCount: 8,
  memoryBytes: 65536,
  createdAt: "2026-07-19T00:00:00.000Z",
};

function localStorageKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i)!);
  return keys;
}

beforeEach(() => {
  localStorage.clear();
  useDatasetsStore.setState({
    datasets: [],
    tables: [],
    workerStatus: "idle",
    workerError: null,
  });
  useSettingsStore.setState({
    aiMode: null,
    byokPreference: "free-tier-first",
    theme: "system",
  });
});

describe("privacy gate", () => {
  it("a populated dataset persists only its catalog metadata (07c) — never row content", () => {
    useDatasetsStore.getState().registerDataset(dataset, [table]);
    useSettingsStore.getState().setTheme("dark");

    expect(localStorageKeys().sort()).toEqual(
      [DATASETS_STORAGE_KEY, SETTINGS_STORAGE_KEY].sort(),
    );

    const settingsPersisted = JSON.parse(
      localStorage.getItem(SETTINGS_STORAGE_KEY)!,
    );
    expect(settingsPersisted.state).toEqual({
      aiMode: null,
      byokPreference: "free-tier-first",
      // The D3 routing-touched flag is a preference too — never dataset content.
      byokRoutingTouched: false,
      theme: "dark",
      skipToData: false,
      // The local-model download consent is a preference, never content.
      webllmConsent: null,
      // §11.3 / 06-ai/03: the metadata-only-repair toggle is a preference too.
      metadataOnlyRepair: true,
      // §12.3: the "links I created" list — tokens/labels, never dataset content.
      shareLinks: [],
    });

    const datasetsPersisted = JSON.parse(
      localStorage.getItem(DATASETS_STORAGE_KEY)!,
    );
    // Exactly the catalog whitelist — name, table names, schema. Never
    // `workerStatus`, and never a row: `Dataset`/`TableRegistryEntry` carry no
    // field that could hold one, so the amended §22 line ("no rows in
    // localStorage") holds by construction, not by omitting the dataset entirely.
    expect(datasetsPersisted.state).toEqual({
      datasets: [dataset],
      tables: [table],
    });
  });

  it("a BYOK key survives only in memory — never localStorage, in any storage key (D9)", () => {
    useByokKeyStore.getState().setKey("sk-privacy-canary-key");
    useSettingsStore.getState().setByokPreference("prefer-key"); // force a settings persist write

    expect(useByokKeyStore.getState().key).toBe("sk-privacy-canary-key");
    const everything = localStorageKeys()
      .map((k) => `${k}=${localStorage.getItem(k)}`)
      .join("|");
    expect(everything).not.toContain("sk-privacy-canary-key");
  });
});
