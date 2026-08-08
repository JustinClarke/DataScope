// Structure report export (D20) — a one-click, entirely client-side export
// of schema + semantic types + profile aggregates + the insight feed. Zero
// server surface (no v0.5 persistence dependency): a Blob download, nothing
// sent anywhere. With the Join Graph enabled this also carries the inferred
// relationships; when the graph is cut, the relationships section is simply
// omitted and the report stays a valid schema-only artifact.
//
// This is the concrete DSPS document (D31/D37) — `dsps.ts` layers the version
// contract, the fact-provenance/snapshot vocabulary, and the compatibility-
// aware reader on top of the shape built here.
import type { TableRegistryEntry } from "../types";
import type { TableInsights } from "./dossier";
import type { FkEdge } from "./relationshipInference";
import { DSPS_VERSION, type DspsProvenance, type DspsSnapshot } from "./dsps";

export interface StructureReportColumn {
  name: string;
  semanticType: string;
  physicalType: string;
  nullPercentage: number | null;
  cardinality: number;
  classificationReason?: string;
}

export interface StructureReportTable {
  tableName: string;
  rowCount: number;
  columnCount: number;
  columns: StructureReportColumn[];
}

export interface StructureReportInsight {
  tableName: string;
  rule: string;
  description: string;
  /** D45 fact provenance — v0 ships every fact freshly computed this run. */
  provenance: DspsProvenance;
  /** D45 snapshot label — when the fact was computed, and the source file's hash when one is available. */
  snapshot: DspsSnapshot;
}

export interface StructureReportRelationship {
  childTable: string;
  childColumn: string;
  parentTable: string;
  parentColumn: string;
  confidence: "confident" | "candidate";
  containment: number;
  evidence: string;
}

export interface StructureReport {
  /** DSPS spec version (D37) — semver; a consumer on an older major reads known fields and ignores the rest. */
  dspsVersion: string;
  generatedAt: string;
  tables: StructureReportTable[];
  insights: StructureReportInsight[];
  /** Present only when the Join Graph is enabled and inferred edges exist (D24). Absent = schema-only report. */
  relationships?: StructureReportRelationship[];
}

/**
 * Build the report. `relationships` is passed only when the join graph is
 * enabled and produced edges; omit it for the schema-only cut path, where the
 * report simply carries no `relationships` field.
 */
export function buildStructureReport(
  tables: TableRegistryEntry[],
  tableInsights: TableInsights[],
  relationships?: FkEdge[],
): StructureReport {
  const generatedAt = new Date().toISOString();
  const report: StructureReport = {
    dspsVersion: DSPS_VERSION,
    generatedAt,
    tables: tables.map((t) => ({
      tableName: t.tableName,
      rowCount: t.rowCount,
      columnCount: t.columnCount,
      columns: (t.columns ?? []).map((c) => ({
        name: c.name,
        semanticType: c.semanticType,
        physicalType: c.physicalType,
        nullPercentage: c.nullPercentage,
        cardinality: c.cardinality,
        classificationReason: c.classificationReason,
      })),
    })),
    insights: tableInsights.flatMap((ti) =>
      ti.insights.map((insight) => ({
        tableName: ti.table.tableName,
        rule: insight.rule,
        description: insight.description,
        provenance: "derived-this-run" as const,
        snapshot: { date: generatedAt, fileHash: ti.table.fileHash ?? null },
      })),
    ),
  };

  if (relationships && relationships.length > 0) {
    report.relationships = relationships.map((e) => ({
      childTable: e.childTable,
      childColumn: e.childColumn,
      parentTable: e.parentTable,
      parentColumn: e.parentColumn,
      confidence: e.confidence,
      containment: e.containment,
      evidence: e.evidence,
    }));
  }

  return report;
}

/**
 * Column-name redaction (§12.3) — one of the share dialog's one-click
 * structure-only controls. Replaces every column name with a positional
 * placeholder (`column_1`, `column_2`, ...) so the hosted artifact carries no
 * real column names, which D59 already names as themselves re-identifiable/
 * sensitive. Renumbers per table, not globally, so two single-column tables
 * both start at `column_1` rather than leaking a cross-table column count.
 * Insight/relationship text is left as-is — the D46 nudge and the report's
 * own insights already run before this transform, over the real names.
 */
export function redactColumnNames(report: StructureReport): StructureReport {
  return {
    ...report,
    tables: report.tables.map((table) => ({
      ...table,
      columns: table.columns.map((column, index) => ({
        ...column,
        name: `column_${index + 1}`,
      })),
    })),
  };
}

/** Triggers a browser download of the report as formatted JSON. DOM-only — kept separate from the pure builder above so that stays unit-testable without jsdom. */
export function downloadStructureReport(
  report: StructureReport,
  filename = "datascope-structure-report.json",
): void {
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
