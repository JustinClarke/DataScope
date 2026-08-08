import { describe, expect, it } from "vitest";
import { OPERATION_NAMES } from "./operations";
import {
  ANALYSIS_TOOL_COUNT,
  ANALYST_TOOLS,
  ANALYST_TOOL_COUNT,
  PRODUCT_SURFACE_OPERATIONS,
  analystTool,
  catalogDrift,
} from "./toolSchemas";

describe("the catalog described and the catalog implemented are the same catalog", () => {
  it("has a schema for every operation and an operation for every schema", () => {
    // The single assertion this file exists for. Adding a handler to
    // `operations.ts` without describing it here ships an operation no model can
    // discover; describing one that does not exist ships a tool that always
    // errors. Both are silent without this.
    expect(catalogDrift()).toEqual({ missingSchema: [], orphanSchema: [] });
  });

  it("declares twenty operations — eighteen scored, two product surface", () => {
    // D74 warned that "about sixteen" is not a harmless label when tool-count
    // pressure is one of the things the experiment measures. If either number
    // changes, the leaf doc, the experiment record and the ablation arm all need
    // to change with it — so it fails here first.
    //
    // The split is the load-bearing half. A6 grew the app's catalog without
    // growing the *scored* one; closing the `data_quality` gap grew the scored
    // one back to D74's original eighteen. `runHarness` filters on the same tag.
    expect(ANALYST_TOOL_COUNT).toBe(20);
    expect(OPERATION_NAMES).toHaveLength(20);
    expect(ANALYSIS_TOOL_COUNT).toBe(18);
    expect([...PRODUCT_SURFACE_OPERATIONS].sort()).toEqual([
      "create_chart",
      "pin_result",
    ]);
  });

  it("tags every product-surface operation as one the catalog actually has", () => {
    // A tag naming an operation that does not exist would silently exclude
    // nothing from the scored run — the failure mode the filter is meant to
    // prevent, hidden behind a typo.
    for (const name of PRODUCT_SURFACE_OPERATIONS) {
      expect(OPERATION_NAMES).toContain(name);
    }
  });

  it("resolves a tool by name and refuses one it does not have", () => {
    expect(analystTool("run_sql")?.title).toBe("Run SQL");
    expect(analystTool("summarize_everything")).toBeUndefined();
  });
});

describe("every schema is one a provider can translate", () => {
  it.each(ANALYST_TOOLS.map((tool) => [tool.name, tool] as const))(
    "%s",
    (_name, tool) => {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties).toBeTypeOf("object");
      // `additionalProperties: false` is what turns a misspelled parameter into a
      // refusal the model can read rather than a silently ignored argument.
      expect(tool.inputSchema.additionalProperties).toBe(false);

      const properties = tool.inputSchema.properties as Record<string, unknown>;
      const required = (tool.inputSchema.required ?? []) as string[];
      // A required parameter that is not declared is the failure mode that makes a
      // tool uncallable while looking fine.
      for (const key of required)
        expect(Object.keys(properties)).toContain(key);
    },
  );

  it("uses no $ref anywhere", () => {
    // Provider tool-calling translates these into native formats and `$ref`
    // resolution is the first thing that varies between them — see the header of
    // `toolSchemas.ts`. A flattened `$ref` costs the parameter silently.
    expect(JSON.stringify(ANALYST_TOOLS)).not.toContain("$ref");
  });
});

describe("descriptions carry what D74 said they must", () => {
  const OTHER_NAMES = ANALYST_TOOLS.map((t) => t.name);

  it.each(ANALYST_TOOLS.map((tool) => [tool.name, tool] as const))(
    "%s states its shape and its boundary",
    (name, tool) => {
      expect(tool.description.length).toBeGreaterThan(120);

      // The clause that does the most work: what this operation does *not*
      // cover, and which one does. Without it a small model picking `aggregate`
      // when it wanted `time_series` has nothing to correct against.
      //
      // Checked as "points somewhere else" rather than by matching phrasing —
      // an earlier version of this test grepped for stock negations and passed
      // descriptions that named no alternative while failing ones that did.
      const pointsAtAnother = OTHER_NAMES.some(
        (other) => other !== name && tool.description.includes(other),
      );
      const statesALimit =
        /(\bnot\b|\bcannot\b|\bnever\b|refuses?|\bonly\b|rather than|instead of)/i.test(
          tool.description,
        );
      expect(pointsAtAnother || statesALimit).toBe(true);
    },
  );

  it("never tells the model what to conclude", () => {
    // D74: tool descriptions may make mechanics and preconditions clear; they do
    // not tell the model what analysis to perform or what to conclude. The
    // banned shape is a recommendation about the *question*, not about mechanics.
    for (const tool of ANALYST_TOOLS) {
      expect(tool.description).not.toMatch(
        /most (interesting|important|useful) (finding|insight)/i,
      );
      expect(tool.description).not.toMatch(
        /\b(you should conclude|this proves|indicates that the)\b/i,
      );
    }
  });
});
