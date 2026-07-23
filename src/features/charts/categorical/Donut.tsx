import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { FrequencyRow } from '../../../lib/categoricalSql';

const SLICE_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#a855f7', '#0ea5e9', '#ec4899'];
const OTHER_COLOR = 'var(--color-border)';

/**
 * Pie/donut for small-cardinality categories (§10 Module 6). `rows` is
 * expected already tail-lumped (`lib/categoricalSql.ts`'s `lumpTail`) — an
 * "Other" slice, when present, always renders in a muted neutral color
 * rather than competing with the real category palette.
 */
export function Donut({ rows }: { rows: FrequencyRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={rows} dataKey="count" nameKey="category" innerRadius={60} outerRadius={100} paddingAngle={1}>
          {rows.map((row, i) => (
            <Cell key={row.category} fill={row.category === 'Other' ? OTHER_COLOR : SLICE_COLORS[i % SLICE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default Donut;
