// Frozen model-facing schema and semantics for the standalone DuckDB + local
// Qwen data chat (see the experiment doc,
// `_implementation/_misc/_ideation/_experiments/duckdb-local-chat.md`).
//
// Single source of truth for three consumers that must never drift apart:
// `bootstrap.ts` (creates these views), the system prompt in `chat.ts` (describes
// them to the model), and `sqlGuard.ts` (the allowlist the model is confined to).
// A table added here without updating all three would either break the chat
// loop or silently widen what the model can query — so nothing downstream
// hand-copies these strings.

export const SOURCE_TABLE_DDL = `
CREATE TABLE customers (
  customer_id INTEGER PRIMARY KEY,
  name VARCHAR NOT NULL,
  email VARCHAR NOT NULL,
  country VARCHAR NOT NULL,
  signup_date DATE NOT NULL
);

CREATE TABLE products (
  product_id INTEGER PRIMARY KEY,
  name VARCHAR NOT NULL,
  category VARCHAR NOT NULL,
  unit_price DECIMAL(12, 2) NOT NULL
);

CREATE TABLE orders (
  order_id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  order_date DATE NOT NULL,
  status VARCHAR NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

CREATE TABLE order_items (
  order_item_id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(12, 2) NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(order_id),
  FOREIGN KEY (product_id) REFERENCES products(product_id)
);
`;

export const ANALYTICS_VIEW_DDL = `
CREATE SCHEMA analytics;

CREATE VIEW analytics.sales_lines AS
SELECT
  o.order_id,
  o.order_date,
  o.status,
  c.customer_id,
  c.country,
  p.product_id,
  p.name AS product_name,
  p.category,
  oi.quantity,
  oi.unit_price AS sale_unit_price,
  CAST(oi.quantity * oi.unit_price AS DECIMAL(18, 2)) AS line_revenue
FROM orders AS o
JOIN customers AS c ON c.customer_id = o.customer_id
JOIN order_items AS oi ON oi.order_id = o.order_id
JOIN products AS p ON p.product_id = oi.product_id;

CREATE VIEW analytics.order_totals AS
SELECT
  order_id,
  order_date,
  status,
  customer_id,
  country,
  COUNT(*) AS line_count,
  SUM(quantity) AS item_quantity,
  CAST(SUM(line_revenue) AS DECIMAL(18, 2)) AS order_revenue
FROM analytics.sales_lines
GROUP BY order_id, order_date, status, customer_id, country;
`;

/** The only two objects a proposed query may reference — enforced by `sqlGuard.ts`. */
export const ALLOWED_VIEWS = ['sales_lines', 'order_totals'] as const;
export type AllowedView = (typeof ALLOWED_VIEWS)[number];
export const ANALYTICS_SCHEMA = 'analytics';

export interface ViewColumn {
  name: string;
  type: string;
  description: string;
}

export const VIEW_SCHEMAS: Record<AllowedView, { grain: string; columns: ViewColumn[] }> = {
  sales_lines: {
    grain: 'One row per product line within an order (one order_item).',
    columns: [
      { name: 'order_id', type: 'INTEGER', description: 'The order this line belongs to.' },
      { name: 'order_date', type: 'DATE', description: 'The date the order was placed.' },
      { name: 'status', type: 'VARCHAR', description: "One of 'completed', 'shipped', 'cancelled', 'refunded'." },
      { name: 'customer_id', type: 'INTEGER', description: 'The customer who placed the order.' },
      { name: 'country', type: 'VARCHAR', description: "The customer's country." },
      { name: 'product_id', type: 'INTEGER', description: 'The product on this line.' },
      { name: 'product_name', type: 'VARCHAR', description: 'The product name.' },
      { name: 'category', type: 'VARCHAR', description: 'The product category.' },
      { name: 'quantity', type: 'INTEGER', description: 'Units of the product on this line.' },
      { name: 'sale_unit_price', type: 'DECIMAL(12,2)', description: 'The price on this order line at time of sale. Never substitute a current product price for this.' },
      { name: 'line_revenue', type: 'DECIMAL(18,2)', description: 'quantity * sale_unit_price for this line.' },
    ],
  },
  order_totals: {
    grain: 'One row per order (already summed across its lines).',
    columns: [
      { name: 'order_id', type: 'INTEGER', description: 'The order.' },
      { name: 'order_date', type: 'DATE', description: 'The date the order was placed.' },
      { name: 'status', type: 'VARCHAR', description: "One of 'completed', 'shipped', 'cancelled', 'refunded'." },
      { name: 'customer_id', type: 'INTEGER', description: 'The customer who placed the order.' },
      { name: 'country', type: 'VARCHAR', description: "The customer's country." },
      { name: 'line_count', type: 'BIGINT', description: 'Number of product lines in the order.' },
      { name: 'item_quantity', type: 'BIGINT', description: 'Total units across all lines in the order.' },
      { name: 'order_revenue', type: 'DECIMAL(18,2)', description: 'Total revenue for the whole order (sum of its line_revenue).' },
    ],
  },
};

/** The four business-semantic rules the doc requires in the system prompt, verbatim. */
export const BUSINESS_RULES: readonly string[] = [
  'Line revenue is order_items.quantity * order_items.unit_price.',
  'order_items.unit_price is the price on the order line. Do not substitute products.unit_price when calculating historical revenue.',
  "Order status is one of 'completed', 'shipped', 'cancelled', or 'refunded'.",
  "A generic request for sales or revenue means status = 'completed' unless the user explicitly chooses another scope.",
];

/**
 * What this dataset cannot answer, with the keywords a question about it would
 * use — the host's independent capability check (experiment doc, "Model
 * contract": "the model does not get final authority to refuse an answerable
 * question"). A model's `unsupported` proposal is only accepted outright when
 * the question matches one of these; otherwise the host disputes it and gives
 * the model one bounded chance to reconsider (see `chat.ts`).
 */
export interface UnsupportedTopic {
  topic: string;
  keywords: readonly string[];
}

export const UNSUPPORTED_TOPICS: readonly UnsupportedTopic[] = [
  { topic: 'cost or profit (no cost field exists)', keywords: ['profit', 'margin', 'cost'] },
  { topic: 'customer age or demographics (no age field exists)', keywords: ['age', 'demographic', 'gender'] },
  { topic: 'marketing campaigns or attribution (no such field exists)', keywords: ['campaign', 'marketing', 'attribution', 'channel', 'ad spend'] },
  { topic: 'experimental design or A/B test assignment (no such field exists)', keywords: ['a/b test', 'experiment', 'treatment group', 'control group', 'variant'] },
];

/** Lowercase keyword match against the frozen unsupported-topic list; null when the question does not match any known gap. */
export function matchUnsupportedTopic(question: string): UnsupportedTopic | null {
  const q = question.toLowerCase();
  return UNSUPPORTED_TOPICS.find((t) => t.keywords.some((k) => q.includes(k))) ?? null;
}

/**
 * The system prompt's fixed schema block (experiment doc, "Model contract":
 * "the two view schemas; the grain of each view; the four business-semantic
 * rules"). No sample rows, no source-table schema, no customer PII, no
 * filesystem paths — `chat.ts` appends only the question and, on a follow-up,
 * a compact prior-turn summary.
 */
export function buildSchemaPrompt(): string {
  const viewBlocks = ALLOWED_VIEWS.map((view) => {
    const { grain, columns } = VIEW_SCHEMAS[view];
    const columnLines = columns.map((c) => `  - ${c.name} (${c.type}): ${c.description}`).join('\n');
    return `${ANALYTICS_SCHEMA}.${view} — ${grain}\n${columnLines}`;
  }).join('\n\n');

  const rules = BUSINESS_RULES.map((r) => `- ${r}`).join('\n');
  const unsupportedList = UNSUPPORTED_TOPICS.map((t) => `- ${t.topic}`).join('\n');

  return `You answer questions about an ecommerce dataset using one DuckDB SQL SELECT statement.

You may query only these two views (never any other table):

${viewBlocks}

Business rules:
${rules}

This dataset cannot answer questions about:
${unsupportedList}
If asked about one of those, reply with status "unsupported" and a one-sentence reason naming the missing field. For every other question, propose a query — do not refuse a question just because it is unfamiliar.`;
}
