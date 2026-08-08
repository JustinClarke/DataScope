import { describe, it, expect } from "vitest";
import {
  chartSpecValidator,
  rankedActionValidator,
  narrationValidator,
  passesPhrasingGuard,
  passesTrendGeneralisationGuard,
} from "./producerValidators";
import type { ChartSpec } from "./../types";
import type { CitableFact } from "./citableFacts";
import type { FactRef, RankedAction } from "../types";

const fact: FactRef = {
  statement: "Revenue spans 900 distinct values.",
  sql: "SELECT count(distinct revenue) FROM orders",
  snapshot: "2026-07-21T00:00:00Z",
  confidence: "high",
  provenance: "insight-rule",
};

const action: RankedAction = {
  verb: "Chart revenue over order_date",
  module: "charts",
  prefill: { module: "charts", prefilledConfig: { table: "orders" } },
  evidence: fact,
  score: 0.8,
};

const other: RankedAction = {
  verb: "Profile the customers table",
  module: "profile",
  prefill: { module: "profile", prefilledConfig: { tableName: "customers" } },
  evidence: { ...fact, statement: "3% of customer rows are null." },
  score: 0.5,
};

describe("rankedActionValidator", () => {
  it("accepts a re-ordered, re-phrased list (same set)", () => {
    const candidate: RankedAction[] = [
      { ...other },
      { ...action, verb: "Plot revenue by day" },
    ];
    expect(rankedActionValidator([action, other], candidate)).toBe(true);
  });

  it("rejects a dropped action", () => {
    expect(rankedActionValidator([action, other], [action])).toBe(false);
  });

  it("rejects an added action", () => {
    expect(rankedActionValidator([action], [action, other])).toBe(false);
  });

  it("rejects a changed module (an invented route)", () => {
    expect(
      rankedActionValidator([action], [{ ...action, module: "sql" }]),
    ).toBe(false);
  });

  it("rejects a changed prefill or evidence", () => {
    expect(
      rankedActionValidator(
        [action],
        [{ ...action, evidence: { ...fact, sql: "DROP TABLE orders" } }],
      ),
    ).toBe(false);
    expect(rankedActionValidator([action], [{ ...action, score: 0.99 }])).toBe(
      false,
    );
  });

  it("rejects an over-claiming verb — the one free-text field on this path", () => {
    expect(
      rankedActionValidator(
        [action],
        [{ ...action, verb: "Chart the revenue drop caused by price" }],
      ),
    ).toBe(false);
    expect(
      rankedActionValidator(
        [action],
        [{ ...action, verb: "Chart revenue, which always rises" }],
      ),
    ).toBe(false);
  });
});

describe("passesTrendGeneralisationGuard", () => {
  it("rejects the unhedged generalisations the D45 guard lets through", () => {
    expect(passesPhrasingGuard("Orders consistently peak on Tuesdays.")).toBe(
      true,
    );
    expect(
      passesTrendGeneralisationGuard("Orders consistently peak on Tuesdays."),
    ).toBe(false);
    expect(
      passesTrendGeneralisationGuard(
        "Older cohorts exhibit steadily increasing order values.",
      ),
    ).toBe(false);
  });

  it("accepts a stated trend that does not generalise", () => {
    expect(
      passesTrendGeneralisationGuard(
        "Order count is highest on Tuesdays in this sample.",
      ),
    ).toBe(true);
  });
});

describe("narrationValidator", () => {
  it("accepts a re-phrased statement with every other field intact", () => {
    expect(
      narrationValidator(fact, {
        ...fact,
        statement: "There are 900 distinct revenue values.",
      }),
    ).toBe(true);
  });

  it("rejects a changed numeric provenance field", () => {
    expect(
      narrationValidator(fact, {
        ...fact,
        sql: "SELECT 1",
        statement: "reworded",
      }),
    ).toBe(false);
    expect(
      narrationValidator(fact, {
        ...fact,
        confidence: "low",
        statement: "reworded",
      }),
    ).toBe(false);
  });

  it("rejects over-claiming phrasing (D45 guard)", () => {
    expect(
      narrationValidator(fact, {
        ...fact,
        statement: "Revenue always exceeds cost.",
      }),
    ).toBe(false);
    expect(
      narrationValidator(fact, {
        ...fact,
        statement: "Growth is caused by price.",
      }),
    ).toBe(false);
    expect(
      narrationValidator(fact, {
        ...fact,
        statement: "This is a verified relationship.",
      }),
    ).toBe(false);
  });
});

// The clause-citation-binding candidate's amendment (03-clause-citation-binding.md,
// "What to build" item 3): an optional third `citedFact` argument, additive
// over every test above (all still call the 2-arg form, unmodified).
describe("narrationValidator with a citedFact", () => {
  const outlierFact: CitableFact = {
    id: "fact:titanic.outlier-group:Pclass:Fare",
    entities: ["titanic", "Pclass", "Fare"],
    values: ["1", "1.6"],
    vocabulary: ["titanic", "Survived", "Pclass", "Fare"],
    ref: fact,
  };

  it("accepts a re-phrase that stays inside the cited fact's own entities/values", () => {
    expect(
      narrationValidator(
        fact,
        {
          ...fact,
          statement: 'Fare for Pclass group "1" runs 1.6σ above the rest.',
        },
        outlierFact,
      ),
    ).toBe(true);
  });

  it("rejects a real column named by inflection that the cited fact never named (misattribution)", () => {
    expect(
      narrationValidator(
        fact,
        {
          ...fact,
          statement:
            "Fares for survivors average 1.6σ higher than non-survivors.",
        },
        outlierFact,
      ),
    ).toBe(false);
  });

  it("still enforces the byte-identity checks even with a citedFact given", () => {
    expect(
      narrationValidator(
        fact,
        { ...fact, sql: "SELECT 1", statement: 'Fare for Pclass group "1".' },
        outlierFact,
      ),
    ).toBe(false);
  });
});

describe("chartSpecValidator", () => {
  const baseline: ChartSpec = {
    type: "time-series",
    title: "revenue, orders over month",
    xField: "month",
    yFields: ["revenue", "orders"],
    seriesField: "region",
  };

  it("accepts a re-title", () => {
    expect(
      chartSpecValidator(baseline, {
        ...baseline,
        title: "Revenue and orders by month",
      }),
    ).toBe(true);
  });

  it("accepts a subset of the measures, in any order, and a dropped series", () => {
    expect(
      chartSpecValidator(baseline, { ...baseline, yFields: ["orders"] }),
    ).toBe(true);
    expect(
      chartSpecValidator(baseline, {
        ...baseline,
        yFields: ["orders", "revenue"],
      }),
    ).toBe(true);
    expect(
      chartSpecValidator(baseline, { ...baseline, seriesField: undefined }),
    ).toBe(true);
  });

  it("rejects any field the baseline did not already name", () => {
    // The whole safety property: no field name in an accepted spec came from
    // the model, so the renderer cannot be handed a column the data lacks.
    expect(
      chartSpecValidator(baseline, {
        ...baseline,
        yFields: ["revenue", "margin"],
      }),
    ).toBe(false);
    expect(
      chartSpecValidator(baseline, { ...baseline, xField: "quarter" }),
    ).toBe(false);
    expect(
      chartSpecValidator(baseline, { ...baseline, seriesField: "segment" }),
    ).toBe(false);
    expect(
      chartSpecValidator(baseline, { ...baseline, type: "categorical" }),
    ).toBe(false);
  });

  it("rejects an empty or duplicated measure list", () => {
    expect(chartSpecValidator(baseline, { ...baseline, yFields: [] })).toBe(
      false,
    );
    expect(
      chartSpecValidator(baseline, {
        ...baseline,
        yFields: ["revenue", "revenue"],
      }),
    ).toBe(false);
  });

  it("holds the title to the same D45 guard as a re-phrased verb", () => {
    expect(
      chartSpecValidator(baseline, {
        ...baseline,
        title: "Orders always peak in March",
      }),
    ).toBe(false);
    expect(
      chartSpecValidator(baseline, {
        ...baseline,
        title: "Revenue rose because of the promotion",
      }),
    ).toBe(false);
    expect(chartSpecValidator(baseline, { ...baseline, title: "" })).toBe(
      false,
    );
  });
});

describe("passesPhrasingGuard", () => {
  it("passes a plain statistic", () => {
    expect(
      passesPhrasingGuard("The table has 1,200 rows across 8 columns."),
    ).toBe(true);
  });
  it("flags permanence and causal wording", () => {
    expect(passesPhrasingGuard("Sales never dip below 100.")).toBe(false);
    expect(passesPhrasingGuard("Revenue drives churn.")).toBe(false);
  });
});
