// Act 0's Tier-B specimen (design.md § Per-page allowances + § Variants,
// resolved 2026-07-25) — a hand-built SVG of the instrument's own output
// vocabulary: two entity cards joined on a foreign key, over a distribution
// strip. It clears the enrichment ban a cloud icon does not, because it is a
// drawing of what the app *makes* rather than an ornament: the amber PK /
// purple FK legend and `--chart-1` are doing here exactly what they do on the
// real map and the real profile.
//
// Drawn from the shipped `ecommerce` sample's real tables and columns
// (`samples.ts`) — never an invented schema, and deliberately carrying no row
// counts, percentages or any other number, since a fabricated metric on the
// front door is the thing § Variants' standing limits exist to stop. Static by
// § Motion ("Reveal pattern: none"): nothing here animates, on load or after.
//
// `aria-hidden` with the caption beside it doing the real work — this is an
// illustration of the product, not data the user can read or act on.

interface Field {
  name: string;
  /** Drives the row's mark and colour: the amber PK diamond, the purple FK dot, or neither. */
  role?: 'pk' | 'fk';
}

interface Entity {
  table: string;
  x: number;
  y: number;
  fields: Field[];
}

// Wide and short on purpose. The plate sits in the slack between sections 01
// and 03, which on a 1280×800 laptop is ~160px — a tall composition just gets
// letterboxed down there until the field names stop being legible, which
// defeats the point of showing them. Proportioned to fit that slack at natural
// size instead, so it only ever shrinks on a genuinely short window.
const CARD_W = 104;
const HEADER_H = 15;
const ROW_H = 13;

const ENTITIES: Entity[] = [
  {
    table: 'customers',
    x: 4,
    y: 2,
    fields: [{ name: 'id', role: 'pk' }, { name: 'email' }, { name: 'city' }],
  },
  {
    table: 'orders',
    x: 192,
    y: 16,
    fields: [{ name: 'id', role: 'pk' }, { name: 'customer_id', role: 'fk' }, { name: 'total' }],
  },
];

// The join: customers.id (row 0 of the left card) → orders.customer_id (row 1
// of the right card), routed orthogonally the way the map's own edges are.
const EDGE_FROM = { x: 4 + CARD_W, y: 2 + HEADER_H + ROW_H / 2 };
const EDGE_TO = { x: 192, y: 16 + HEADER_H + ROW_H * 1.5 };
const EDGE_MID = (EDGE_FROM.x + EDGE_TO.x) / 2;

// A right-skewed shape — what an `orders.total` column actually looks like.
// Proportions only: no axis, no ticks, no numbers, nothing to misread as a
// measurement of the reader's own data. Narrow bins on purpose: this is the
// texture a real distribution has, and a coarser strip reads louder than the
// entity cards it is supposed to sit under.
const BARS = [
  0.08, 0.19, 0.34, 0.52, 0.71, 0.88, 0.97, 1, 0.95, 0.86, 0.74, 0.62,
  0.51, 0.42, 0.34, 0.27, 0.21, 0.16, 0.12, 0.09, 0.06, 0.04,
];
const BAR_STEP = 13;
const BAR_W = 9;
const STRIP_BASE = 114;
const STRIP_MAX = 28;

function EntityCard({ entity }: { entity: Entity }) {
  const height = HEADER_H + entity.fields.length * ROW_H;
  return (
    <g>
      <rect
        x={entity.x}
        y={entity.y}
        width={CARD_W}
        height={height}
        rx={4}
        className="fill-(--color-card) stroke-(--color-rule)"
        strokeWidth={1}
      />
      <line
        x1={entity.x}
        y1={entity.y + HEADER_H}
        x2={entity.x + CARD_W}
        y2={entity.y + HEADER_H}
        className="stroke-(--color-rule)"
        strokeWidth={1}
      />
      <text
        x={entity.x + 8}
        y={entity.y + 12}
        className="fill-(--color-ink) font-mono text-[8px] font-medium"
      >
        {entity.table}
      </text>
      {entity.fields.map((field, index) => {
        const rowY = entity.y + HEADER_H + index * ROW_H;
        const markY = rowY + ROW_H / 2;
        return (
          <g key={field.name}>
            {field.role === 'pk' && (
              <rect
                x={entity.x + 7}
                y={markY - 2.5}
                width={5}
                height={5}
                className="fill-(--color-pk)"
                transform={`rotate(45 ${entity.x + 9.5} ${markY})`}
              />
            )}
            {field.role === 'fk' && (
              <circle cx={entity.x + 9.5} cy={markY} r={2.5} className="fill-(--color-fk)" />
            )}
            <text
              x={entity.x + 18}
              y={markY + 2.5}
              className={`font-mono text-[7px] ${field.role ? 'fill-(--color-ink-2)' : 'fill-(--color-ink-3)'}`}
            >
              {field.name}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function SpecimenPlate() {
  return (
    <svg
      viewBox="0 0 300 120"
      data-testid="specimen-plate"
      aria-hidden="true"
      className="min-h-0 w-full max-w-[26rem] flex-1"
      preserveAspectRatio="xMidYMid meet"
    >
      {ENTITIES.map((entity) => (
        <EntityCard key={entity.table} entity={entity} />
      ))}

      <path
        d={`M ${EDGE_FROM.x} ${EDGE_FROM.y} H ${EDGE_MID} V ${EDGE_TO.y} H ${EDGE_TO.x}`}
        fill="none"
        className="stroke-(--color-fk)"
        strokeWidth={1}
      />
      <circle cx={EDGE_FROM.x} cy={EDGE_FROM.y} r={2} className="fill-(--color-fk)" />
      <circle cx={EDGE_TO.x} cy={EDGE_TO.y} r={2} className="fill-(--color-fk)" />

      {BARS.map((value, index) => (
        <rect
          key={index}
          x={6 + index * BAR_STEP}
          y={STRIP_BASE - value * STRIP_MAX}
          width={BAR_W}
          height={value * STRIP_MAX}
          className="fill-(--chart-1)"
        />
      ))}
      <line
        x1={4}
        y1={STRIP_BASE}
        x2={296}
        y2={STRIP_BASE}
        className="stroke-(--color-rule)"
        strokeWidth={1}
      />
    </svg>
  );
}
