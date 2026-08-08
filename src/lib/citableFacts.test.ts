import { describe, it, expect } from "vitest";
import {
  extractEntities,
  extractValues,
  buildCitableFacts,
  checkCitation,
  type CitableFact,
} from "./citableFacts";
import type { ClassifiedColumn, TableRegistryEntry } from "../types";
import type { TableInsights } from "./insights";

const TITANIC_VOCAB = [
  "titanic",
  "PassengerId",
  "Survived",
  "Pclass",
  "Name",
  "Sex",
  "Age",
  "SibSp",
  "Parch",
  "Fare",
  "Embarked",
];

describe("extractEntities", () => {
  it("resolves a literal reuse of a real column/table name", () => {
    expect(extractEntities("Fares for Pclass groups.", TITANIC_VOCAB)).toEqual([
      "Fare",
      "Pclass",
    ]);
  });

  it("resolves an inflected mention to its real column via stemming (the F1 gap)", () => {
    expect(
      extractEntities(
        "Fares for survivors average 1.6σ higher than non-survivors.",
        TITANIC_VOCAB,
      ),
    ).toEqual(["Fare", "Survived"]);
  });

  it("exempts the statement's own first word when it resolves to nothing", () => {
    expect(
      extractEntities("Manchester saw five years of data.", TITANIC_VOCAB),
    ).toEqual([]);
  });

  it("still flags an unrecognized proper noun that is not sentence-initial (an invented name)", () => {
    expect(
      extractEntities("This dataset covers Manchester in full.", TITANIC_VOCAB),
    ).toEqual(["Manchester"]);
  });

  it("returns nothing for an all-lowercase, non-matching statement", () => {
    expect(
      extractEntities(
        "the average value is higher for this group",
        TITANIC_VOCAB,
      ),
    ).toEqual([]);
  });

  it("reports a month name as a candidate entity mention like any other unresolved proper noun", () => {
    // Whether a month name is ultimately allowed depends on whether the cited
    // fact asserts a date at all — that's `checkCitation`'s call (see below),
    // not this function's; extractEntities stays a context-free extractor.
    expect(
      extractEntities("Close dropped 96% in August 2025.", [
        "stock_prices",
        "Date",
        "Close",
      ]),
    ).toEqual(["Close", "August"]);
  });

  it("resolves a verbatim snake_case identifier as one token, not fragments (live-run false-reject/misattribution)", () => {
    const ecommerceVocab = ["order_items", "orders", "order_id", "order_date"];
    // Without underscore-aware tokenization, "order" splits off "order_items"
    // and stem-matches the sibling table "orders" instead — a real
    // misattribution produced by the checker's own tokenizer.
    expect(extractEntities("order_items: 3,487 rows.", ecommerceVocab)).toEqual(
      ["order_items"],
    );
  });
});

describe("extractValues", () => {
  it("extracts numeric tokens with %/σ suffixes", () => {
    expect(extractValues("1.6σ higher, 5.4% null, 1,200 rows")).toEqual([
      "1.6σ",
      "5.4%",
      "1,200",
    ]);
  });

  it("extracts quoted substrings (plus the digit run inside them — over-inclusive by design)", () => {
    expect(extractValues('"1"\'s mean Fare is 1.6σ above the rest.')).toEqual([
      "1",
      "1.6σ",
      "1",
    ]);
  });

  it("extracts an ISO date as one token, not split into non-matching month/day numbers (live-run false-reject)", () => {
    expect(extractValues("Date spans from 2016-01-04 to 2025-08-01.")).toEqual([
      "2016-01-04",
      "2025-08-01",
    ]);
  });

  it("does not extract a quoted vocabulary name as a value (live-run false-reject)", () => {
    expect(
      extractValues("The dataset 'stock_prices' contains 2,500 rows.", [
        "stock_prices",
      ]),
    ).toEqual(["2,500"]);
  });

  it("still extracts a quoted value that is not a vocabulary name", () => {
    expect(
      extractValues('"1"\'s mean Fare is 1.6σ above the rest.', [
        "titanic",
        "Fare",
      ]),
    ).toEqual(["1", "1.6σ", "1"]);
  });

  it("extracts a spelled-out cardinal number as its digit value (live-run fabrication)", () => {
    expect(extractValues("Seven review entries are fully replicated.")).toEqual(
      ["7"],
    );
  });
});

describe("buildCitableFacts", () => {
  const table: TableRegistryEntry = {
    id: "titanic",
    tableName: "titanic",
    datasetId: "titanic",
    origin: "sample",
    rowCount: 891,
    columnCount: 10,
    memoryBytes: 0,
    createdAt: "2026-07-26T00:00:00Z",
    sampled: false,
    profile: [],
    columns: [],
  };

  const tableInsights: TableInsights[] = [
    {
      table,
      insights: [
        {
          id: "outlier-group:Pclass:Fare",
          rule: "outlier-group",
          description: '"1"\'s mean Fare is 1.6σ above the rest.',
          sql: "SELECT ...",
          effectSize: 0.32,
          coverage: 0.24,
        },
      ],
    },
  ];

  it("mints a stable id and entity set from the insight id, not the description", () => {
    const facts = buildCitableFacts([table], tableInsights);
    const outlier = facts.find(
      (f) => f.id === "fact:titanic.outlier-group:Pclass:Fare",
    );
    expect(outlier).toBeDefined();
    expect(outlier?.entities).toEqual(["titanic", "Pclass", "Fare"]);
    expect(outlier?.values).toContain("1.6");
    expect(outlier?.values).toContain("1");
  });

  it("adds a row-count structural fact per table", () => {
    const facts = buildCitableFacts([table], []);
    const rowCount = facts.find((f) => f.id === "fact:titanic.rowCount");
    expect(rowCount?.entities).toEqual(["titanic"]);
    expect(rowCount?.values).toContain("891");
  });

  it("adds a date-range structural fact for Temporal columns only", () => {
    const dateColumn: ClassifiedColumn = {
      name: "Date",
      semanticType: "Temporal",
      physicalType: "DATE",
      nullPercentage: 0,
      cardinality: 3650,
      min: "2015-01-01",
      max: "2019-12-31",
      mean: null,
      stdDev: null,
    };
    const withDate: TableRegistryEntry = { ...table, columns: [dateColumn] };
    const facts = buildCitableFacts([withDate], []);
    const dateRange = facts.find((f) => f.id === "fact:titanic.Date.dateRange");
    expect(dateRange?.entities).toEqual(["titanic", "Date"]);
    expect(dateRange?.values).toEqual(
      expect.arrayContaining([
        "2015-01-01",
        "2019-12-31",
        "2015",
        "2019",
        "4",
        "5",
      ]),
    );
  });

  it("every fact carries the full dataset vocabulary, not just its own entities", () => {
    const facts = buildCitableFacts([table], tableInsights);
    for (const fact of facts) expect(fact.vocabulary).toContain("titanic");
  });

  it("adds Profile to an id-exclusion fact's own entities (its canonical phrasing always names it)", () => {
    const idExclusionInsights: TableInsights[] = [
      {
        table,
        insights: [
          {
            id: "id-exclusion:PassengerId",
            rule: "id-exclusion",
            description:
              '"PassengerId" is near-unique — excluded from analysis (override in Profile).',
            sql: "SELECT ...",
            effectSize: 1,
            coverage: 1,
          },
        ],
      },
    ];
    const facts = buildCitableFacts([table], idExclusionInsights);
    const idExclusion = facts.find(
      (f) => f.id === "fact:titanic.id-exclusion:PassengerId",
    );
    expect(idExclusion?.entities).toEqual([
      "titanic",
      "PassengerId",
      "Profile",
    ]);
  });
});

describe("checkCitation", () => {
  const fact: CitableFact = {
    id: "fact:titanic.outlier-group:Pclass:Fare",
    entities: ["titanic", "Pclass", "Fare"],
    values: ["1", "1.6"],
    vocabulary: TITANIC_VOCAB,
    ref: {
      statement: '"1"\'s mean Fare is 1.6σ above the rest.',
      sql: "",
      snapshot: "",
      confidence: "high",
      provenance: "insight-rule",
    },
  };

  it("accepts a claim naming only the cited fact's own entities and values", () => {
    expect(
      checkCitation('Fare for Pclass group "1" runs 1.6σ above the rest.', fact)
        .ok,
    ).toBe(true);
  });

  it("accepts neutral vocabulary regardless of case", () => {
    expect(
      checkCitation("Average Fare is higher for this group at 1.6σ.", fact).ok,
    ).toBe(true);
  });

  it("rejects a real column named by inflection that the cited fact never named (misattribution — F1)", () => {
    const result = checkCitation(
      "Fares for survivors average 1.6σ higher than non-survivors.",
      fact,
    );
    expect(result.ok).toBe(false);
    expect(result.offendingEntities).toContain("Survived");
  });

  it("rejects an invented name no fact could ever cite (F2/F3-shaped)", () => {
    const result = checkCitation(
      "This covers Manchester in full detail.",
      fact,
    );
    expect(result.ok).toBe(false);
    expect(result.offendingEntities).toContain("Manchester");
  });

  it("rejects a value the cited fact never stated", () => {
    const result = checkCitation(
      'Fare for Pclass group "1" runs 3.2σ above the rest.',
      fact,
    );
    expect(result.ok).toBe(false);
    expect(result.offendingValues).toContain("3.2");
  });

  it("accepts a month name naming a date the cited fact already asserts (live-run false-reject)", () => {
    const changePoint: CitableFact = {
      id: "fact:stock_prices.change-point:Date:Close",
      entities: ["stock_prices", "Date", "Close"],
      values: ["96", "2025", "08"],
      vocabulary: ["stock_prices", "Date", "Close"],
      ref: {
        statement: "Close dropped 96% in 2025-08.",
        sql: "",
        snapshot: "",
        confidence: "high",
        provenance: "insight-rule",
      },
    };
    expect(
      checkCitation(
        "Close dropped by 96% in August 2025, the largest move.",
        changePoint,
      ).ok,
    ).toBe(true);
  });

  it("rejects a fabricated count spelled out in words instead of digits (live-run fabrication)", () => {
    const duplicates: CitableFact = {
      id: "fact:product_reviews.duplicates",
      entities: ["product_reviews"],
      values: ["20"],
      vocabulary: ["product_reviews", "ReviewId", "ReviewDate", "ProductId"],
      ref: {
        statement: "20 fully duplicated rows detected.",
        sql: "",
        snapshot: "",
        confidence: "high",
        provenance: "insight-rule",
      },
    };
    const result = checkCitation(
      "Seven review entries are fully replicated.",
      duplicates,
    );
    expect(result.ok).toBe(false);
    expect(result.offendingValues).toContain("7");
  });

  it("still rejects a month name when the cited fact asserts no date at all (F3)", () => {
    const rowCount: CitableFact = {
      id: "fact:titanic.rowCount",
      entities: ["titanic"],
      values: ["891", "891"],
      vocabulary: TITANIC_VOCAB,
      ref: {
        statement: "titanic: 891 rows.",
        sql: "",
        snapshot: "",
        confidence: "high",
        provenance: "schema",
      },
    };
    const result = checkCitation(
      "This dataset covers the Titanic, which sank in April 1912.",
      rowCount,
    );
    expect(result.ok).toBe(false);
    expect(result.offendingEntities).toContain("April");
  });
});
