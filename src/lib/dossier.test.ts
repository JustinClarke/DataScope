import { describe, expect, it } from "vitest";
import type { ClassifiedColumn, TableRegistryEntry } from "../types";
import type { InsightCandidate } from "./insights";
import {
  buildDatasetVerdict,
  buildDossierViewSpec,
  buildQualityHeadlineItems,
  buildTopInsightRows,
  keyColumnsFor,
  largestTable,
  selectHeadlineFact,
  sharedColumnsFor,
  type TableInsights,
} from "./dossier";

function column(
  name: string,
  semanticType: ClassifiedColumn["semanticType"],
): ClassifiedColumn {
  return {
    name,
    semanticType,
    physicalType: "VARCHAR",
    cardinality: 10,
    nullPercentage: 0,
    min: null,
    max: null,
    mean: null,
    stdDev: null,
  };
}

function table(
  overrides: Partial<TableRegistryEntry> &
    Pick<TableRegistryEntry, "id" | "tableName">,
): TableRegistryEntry {
  return {
    datasetId: "ds1",
    origin: "file",
    rowCount: 100,
    columnCount: 3,
    memoryBytes: 1000,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function candidate(
  overrides: Partial<InsightCandidate> &
    Pick<InsightCandidate, "rule" | "description">,
): InsightCandidate {
  return {
    id: `${overrides.rule}:${Math.random()}`,
    sql: "SELECT 1",
    effectSize: 0.5,
    coverage: 0.5,
    ...overrides,
  };
}

describe("sharedColumnsFor", () => {
  it("finds a column name shared with a sibling table", () => {
    const orders = table({
      id: "orders",
      tableName: "orders",
      columns: [
        column("order_id", "Identifier"),
        column("customer_id", "Identifier"),
      ],
    });
    const customers = table({
      id: "customers",
      tableName: "customers",
      columns: [column("customer_id", "Identifier"), column("name", "Textual")],
    });
    expect(sharedColumnsFor(orders, [orders, customers])).toEqual([
      { column: "customer_id", otherTable: "customers" },
    ]);
  });

  it("returns nothing for an unclassified table", () => {
    const t = table({ id: "t1", tableName: "t1" });
    expect(sharedColumnsFor(t, [t])).toEqual([]);
  });

  it("returns nothing when no other table shares a column", () => {
    const a = table({
      id: "a",
      tableName: "a",
      columns: [column("x", "Categorical")],
    });
    const b = table({
      id: "b",
      tableName: "b",
      columns: [column("y", "Categorical")],
    });
    expect(sharedColumnsFor(a, [a, b])).toEqual([]);
  });
});

describe("keyColumnsFor", () => {
  it("returns only Identifier columns", () => {
    const t = table({
      id: "t1",
      tableName: "t1",
      columns: [column("id", "Identifier"), column("amount", "Quantitative")],
    });
    expect(keyColumnsFor(t)).toEqual(["id"]);
  });

  it("returns empty for a table with no columns yet", () => {
    expect(keyColumnsFor(table({ id: "t1", tableName: "t1" }))).toEqual([]);
  });
});

describe("buildQualityHeadlineItems", () => {
  it("surfaces only quality rules (duplicates/null-pattern/leakage), ranked, capped at 3", () => {
    const t = table({ id: "t1", tableName: "t1" });
    const insights: TableInsights[] = [
      {
        table: t,
        insights: [
          candidate({
            rule: "duplicates",
            description: "412 duplicate rows",
            effectSize: 1,
            coverage: 0.9,
          }),
          candidate({
            rule: "concentration",
            description: "top group dominates",
            effectSize: 1,
            coverage: 0.9,
          }),
          candidate({
            rule: "null-pattern",
            description: "discount_code 61% null",
            effectSize: 1,
            coverage: 0.6,
          }),
          candidate({
            rule: "leakage",
            description: "a and b correlate",
            effectSize: 0.95,
            coverage: 1,
          }),
          candidate({
            rule: "change-point",
            description: "revenue rose",
            effectSize: 1,
            coverage: 0.8,
          }),
        ],
      },
    ];
    const items = buildQualityHeadlineItems(insights);
    expect(items).toHaveLength(3);
    expect(items).not.toContain("top group dominates");
    expect(items).not.toContain("revenue rose");
  });

  it('returns an empty array — never a "no issues" placeholder string — when nothing qualifies', () => {
    const t = table({ id: "t1", tableName: "t1" });
    const insights: TableInsights[] = [{ table: t, insights: [] }];
    expect(buildQualityHeadlineItems(insights)).toEqual([]);
  });
});

describe("buildTopInsightRows", () => {
  it("ranks across tables and caps at 10", () => {
    const tables = Array.from({ length: 15 }, (_, i) =>
      table({ id: `t${i}`, tableName: `t${i}` }),
    );
    const insights: TableInsights[] = tables.map((t, i) => ({
      table: t,
      insights: [
        candidate({
          rule: "duplicates",
          description: `dup ${i}`,
          effectSize: 1,
          coverage: (i + 1) / 15,
        }),
      ],
    }));
    const rows = buildTopInsightRows(insights);
    expect(rows).toHaveLength(10);
    // Highest coverage (t14) should rank first.
    expect(rows[0].tableName).toBe("t14");
  });
});

describe("largestTable", () => {
  it("picks the table with the most rows", () => {
    const a = table({ id: "a", tableName: "a", rowCount: 10 });
    const b = table({ id: "b", tableName: "b", rowCount: 1000 });
    expect(largestTable([a, b])?.id).toBe("b");
  });

  it("returns null for an empty list", () => {
    expect(largestTable([])).toBeNull();
  });
});

describe("buildDossierViewSpec", () => {
  it("always emits identity-band, verdict, hero-table-grid, and table-strip", () => {
    const t = table({
      id: "t1",
      tableName: "orders",
      columns: [column("order_id", "Identifier")],
    });
    const spec = buildDossierViewSpec({
      datasetLabel: "acme",
      tables: [t],
      tableInsights: [{ table: t, insights: [] }],
      timeCoverage: [],
      profiledAt: "2026-07-19T00:00:00.000Z",
    });
    const ids = spec.panels.map((p) => p.componentId);
    expect(ids).toContain("identity-band");
    expect(ids).toContain("verdict");
    expect(ids).toContain("hero-table-grid");
    expect(ids).toContain("table-strip");
    expect(ids).not.toContain("hero-join-graph");
  });

  it("tags identity-band and verdict tier 1, and everything else tier 2 or 3", () => {
    const t = table({
      id: "t1",
      tableName: "orders",
      columns: [column("order_id", "Identifier")],
    });
    const spec = buildDossierViewSpec({
      datasetLabel: "acme",
      tables: [t],
      tableInsights: [
        {
          table: t,
          insights: [
            candidate({
              rule: "duplicates",
              description: "dup",
              effectSize: 1,
              coverage: 1,
            }),
          ],
        },
      ],
      timeCoverage: [
        {
          tableName: "orders",
          columnName: "order_date",
          range: {
            earliest: "2026-01-01",
            latest: "2026-02-01",
            gapDescription: "No gaps detected",
          },
        },
      ],
      profiledAt: "2026-07-19T00:00:00.000Z",
    });
    const tierOf = (id: string) =>
      spec.panels.find((p) => p.componentId === id)?.tier;
    expect(tierOf("identity-band")).toBe(1);
    expect(tierOf("verdict")).toBe(1);
    expect(tierOf("hero-table-grid")).toBe(2);
    expect(tierOf("table-strip")).toBe(2);
    expect(tierOf("quality-headline")).toBe(2);
    expect(tierOf("time-coverage")).toBe(2);
    expect(tierOf("top-insights")).toBe(3);
  });

  it("omits quality-headline, time-coverage, and top-insights when there is nothing to show", () => {
    const t = table({ id: "t1", tableName: "orders" });
    const spec = buildDossierViewSpec({
      datasetLabel: "acme",
      tables: [t],
      tableInsights: [{ table: t, insights: [] }],
      timeCoverage: [],
      profiledAt: "2026-07-19T00:00:00.000Z",
    });
    const ids = spec.panels.map((p) => p.componentId);
    expect(ids).not.toContain("quality-headline");
    expect(ids).not.toContain("time-coverage");
    expect(ids).not.toContain("top-insights");
    // identity-band and verdict are unconditional (tier 1) — a thin profile
    // still gets the floor sentence + generic routing, never an empty screen.
    expect(ids).toContain("verdict");
  });

  it("never emits a sensitive-columns panel in v0", () => {
    const t = table({ id: "t1", tableName: "orders" });
    const spec = buildDossierViewSpec({
      datasetLabel: "acme",
      tables: [t],
      tableInsights: [{ table: t, insights: [] }],
      timeCoverage: [],
      profiledAt: "2026-07-19T00:00:00.000Z",
    });
    expect(spec.panels.map((p) => p.componentId)).not.toContain(
      "sensitive-columns",
    );
  });

  it("produces a spec that is itself JSON-serializable (no functions/React nodes in props)", () => {
    const t = table({
      id: "t1",
      tableName: "orders",
      columns: [column("order_id", "Identifier")],
    });
    const spec = buildDossierViewSpec({
      datasetLabel: "acme",
      tables: [t],
      tableInsights: [
        {
          table: t,
          insights: [
            candidate({
              rule: "duplicates",
              description: "dup",
              effectSize: 1,
              coverage: 1,
            }),
          ],
        },
      ],
      timeCoverage: [
        {
          tableName: "orders",
          columnName: "order_date",
          range: {
            earliest: "2026-01-01",
            latest: "2026-02-01",
            gapDescription: "No gaps detected",
          },
        },
      ],
      profiledAt: "2026-07-19T00:00:00.000Z",
    });
    expect(() => JSON.parse(JSON.stringify(spec))).not.toThrow();
  });

  it("leads with hero-join-graph and keeps hero-table-grid beneath it when relationships exist", () => {
    const orders = table({
      id: "o",
      tableName: "orders",
      columns: [column("customer_id", "Categorical")],
    });
    const customers = table({
      id: "c",
      tableName: "customers",
      columns: [column("id", "Identifier")],
    });
    const spec = buildDossierViewSpec({
      datasetLabel: "shop",
      tables: [orders, customers],
      tableInsights: [
        { table: orders, insights: [] },
        { table: customers, insights: [] },
      ],
      timeCoverage: [],
      profiledAt: "2026-07-19T00:00:00.000Z",
      relationships: [
        {
          id: "orders.customer_id->customers.id",
          childTable: "orders",
          childColumn: "customer_id",
          parentTable: "customers",
          parentColumn: "id",
          containment: 1,
          coverage: 1,
          parentKeyUniqueness: 1,
          nameAgreement: true,
          confidence: "confident",
          confidenceScore: 1,
          evidence: "x",
          source: "inferred",
        },
      ],
    });
    const ids = spec.panels.map((p) => p.componentId);
    expect(ids).toContain("hero-join-graph");
    expect(ids).toContain("hero-table-grid");
    expect(ids.indexOf("hero-join-graph")).toBeLessThan(
      ids.indexOf("hero-table-grid"),
    );
  });

  it("stays on the table-grid hedge when relationships is empty (graph cut or nothing found)", () => {
    const t = table({
      id: "t1",
      tableName: "orders",
      columns: [column("order_id", "Identifier")],
    });
    const spec = buildDossierViewSpec({
      datasetLabel: "acme",
      tables: [t],
      tableInsights: [{ table: t, insights: [] }],
      timeCoverage: [],
      profiledAt: "2026-07-19T00:00:00.000Z",
      relationships: [],
    });
    expect(spec.panels.map((p) => p.componentId)).not.toContain(
      "hero-join-graph",
    );
  });
});

describe("selectHeadlineFact", () => {
  it("states the honest floor sentence — never a manufactured headline — when nothing clears the interest floor", () => {
    const t = table({ id: "t1", tableName: "orders", rowCount: 14232 });
    const fact = selectHeadlineFact([t], [{ table: t, insights: [] }]);
    expect(fact.statement).toBe(
      "1 table · 14,232 rows · no single dominant finding — here's the structure.",
    );
    expect(fact.sql).toBe("");
    expect(fact.provenance).toBe("schema");
  });

  it("also floors when every candidate scores below the threshold", () => {
    const t = table({ id: "t1", tableName: "orders" });
    const insights: TableInsights[] = [
      {
        table: t,
        insights: [
          candidate({
            rule: "change-point",
            description: "tiny move",
            effectSize: 0.01,
            coverage: 0.01,
          }),
        ],
      },
    ];
    const fact = selectHeadlineFact([t], insights);
    expect(fact.statement).toContain("no single dominant finding");
  });

  it("picks the top-scoring candidate by effectSize × coverage when it clears the floor", () => {
    const t = table({ id: "t1", tableName: "orders" });
    const insights: TableInsights[] = [
      {
        table: t,
        insights: [
          candidate({
            rule: "change-point",
            description: "weak signal",
            effectSize: 0.2,
            coverage: 0.2,
          }),
          candidate({
            rule: "concentration",
            description: "strong signal",
            effectSize: 0.9,
            coverage: 0.9,
          }),
        ],
      },
    ];
    const fact = selectHeadlineFact([t], insights);
    expect(fact.statement).toBe("strong signal");
    expect(fact.provenance).toBe("insight-rule");
  });

  it("never headlines an id-exclusion classification note, even when it is the only or top-scoring candidate", () => {
    const t = table({ id: "t1", tableName: "customers" });
    const onlyIdExclusion: TableInsights[] = [
      {
        table: t,
        insights: [
          candidate({
            rule: "id-exclusion",
            description:
              '"customer_id" is near-unique — excluded from analysis.',
            effectSize: 1,
            coverage: 0.1,
          }),
        ],
      },
    ];
    expect(selectHeadlineFact([t], onlyIdExclusion).statement).toContain(
      "no single dominant finding",
    );

    const idExclusionOutscoresReal: TableInsights[] = [
      {
        table: t,
        insights: [
          candidate({
            rule: "id-exclusion",
            description:
              '"customer_id" is near-unique — excluded from analysis.',
            effectSize: 1,
            coverage: 0.5,
          }),
          candidate({
            rule: "change-point",
            description: "revenue dropped 30%",
            effectSize: 0.3,
            coverage: 0.3,
          }),
        ],
      },
    ];
    expect(selectHeadlineFact([t], idExclusionOutscoresReal).statement).toBe(
      "revenue dropped 30%",
    );
  });

  it("breaks a tie in favor of a quality-risk rule (duplicates/null-pattern/leakage)", () => {
    const t = table({ id: "t1", tableName: "orders" });
    const insights: TableInsights[] = [
      {
        table: t,
        insights: [
          candidate({
            rule: "concentration",
            description: "top group dominates",
            effectSize: 0.8,
            coverage: 1,
          }),
          candidate({
            rule: "duplicates",
            description: "412 duplicate rows",
            effectSize: 0.8,
            coverage: 1,
          }),
        ],
      },
    ];
    const fact = selectHeadlineFact([t], insights);
    expect(fact.statement).toBe("412 duplicate rows");
  });
});

describe("buildDatasetVerdict", () => {
  it("names the grain from a single Identifier column, and falls back to a row count otherwise", () => {
    const withId = table({
      id: "t1",
      tableName: "orders",
      columns: [column("order_id", "Identifier")],
      rowCount: 500,
    });
    const verdictWithId = buildDatasetVerdict({
      datasetLabel: "acme",
      tables: [withId],
      tableInsights: [{ table: withId, insights: [] }],
      timeCoverage: [],
      profiledAt: "2026-07-19T00:00:00.000Z",
    });
    expect(verdictWithId.grain).toBe("orders: one row per order_id");

    const noId = table({ id: "t2", tableName: "events", rowCount: 500 });
    const verdictNoId = buildDatasetVerdict({
      datasetLabel: "acme",
      tables: [noId],
      tableInsights: [{ table: noId, insights: [] }],
      timeCoverage: [],
      profiledAt: "2026-07-19T00:00:00.000Z",
    });
    expect(verdictNoId.grain).toBe("events: 500 rows");
  });

  it("leaves timeSpan undefined with no time coverage, and fills it from the largest table when present", () => {
    const t = table({ id: "t1", tableName: "orders" });
    const empty = buildDatasetVerdict({
      datasetLabel: "acme",
      tables: [t],
      tableInsights: [{ table: t, insights: [] }],
      timeCoverage: [],
      profiledAt: "2026-07-19T00:00:00.000Z",
    });
    expect(empty.timeSpan).toBeUndefined();

    const withSpan = buildDatasetVerdict({
      datasetLabel: "acme",
      tables: [t],
      tableInsights: [{ table: t, insights: [] }],
      timeCoverage: [
        {
          tableName: "orders",
          columnName: "order_date",
          range: {
            earliest: "2026-01-01",
            latest: "2026-02-01",
            gapDescription: "No gaps detected",
          },
        },
      ],
      profiledAt: "2026-07-19T00:00:00.000Z",
    });
    expect(withSpan.timeSpan).toBe("2026-01-01 – 2026-02-01");
  });

  it("caps actions at 3 even though the broker may rank up to 5", () => {
    const orders = table({
      id: "o",
      tableName: "orders",
      columns: [
        column("cat", "Categorical"),
        column("a", "Quantitative"),
        column("b", "Quantitative"),
        column("when", "Temporal"),
      ],
    });
    const insights: TableInsights[] = [
      {
        table: orders,
        insights: [
          candidate({
            rule: "concentration",
            description: "1",
            effectSize: 0.9,
            coverage: 0.9,
          }),
          candidate({
            rule: "outlier-group",
            description: "2",
            effectSize: 0.8,
            coverage: 0.8,
          }),
          candidate({
            rule: "change-point",
            description: "3",
            effectSize: 0.7,
            coverage: 0.7,
          }),
          candidate({
            rule: "leakage",
            description: "4",
            effectSize: 0.6,
            coverage: 0.6,
          }),
          candidate({
            rule: "duplicates",
            description: "5",
            effectSize: 0.5,
            coverage: 0.5,
          }),
        ],
      },
    ];
    const verdict = buildDatasetVerdict({
      datasetLabel: "acme",
      tables: [orders],
      tableInsights: insights,
      timeCoverage: [],
      profiledAt: "2026-07-19T00:00:00.000Z",
    });
    expect(verdict.actions).toHaveLength(3);
  });
});
