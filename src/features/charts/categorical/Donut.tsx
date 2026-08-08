import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { FrequencyRow } from "../../../lib/categoricalSql";

const SLICE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
];
const OTHER_COLOR = "var(--chart-other)";

/**
 * Pie/donut for small-cardinality categories (§10 Module 6). `rows` is
 * expected already tail-lumped (`lib/categoricalSql.ts`'s `lumpTail`) to the
 * four slots the palette actually has (design.md § Chart palette) — an "Other"
 * slice, when present, always renders in a muted neutral color rather than
 * competing with the real category palette.
 */
export function Donut({ rows }: { rows: FrequencyRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={rows}
          dataKey="count"
          nameKey="category"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={1}
        >
          {rows.map((row, i) => (
            <Cell
              key={row.category}
              fill={
                row.category === "Other"
                  ? OTHER_COLOR
                  : (SLICE_COLORS[i] ?? OTHER_COLOR)
              }
            />
          ))}
        </Pie>
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default Donut;
