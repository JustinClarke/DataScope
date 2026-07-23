import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { FrequencyRow } from '../../../lib/categoricalSql';

const BAR_COLOR = '#6366f1';
const AXIS = 'var(--color-fg-muted)';
const GRID = 'var(--color-border)';

/**
 * Horizontal, sorted-descending frequency bar chart (§10 Module 6). Recharts'
 * `layout="vertical"` puts the category on the Y axis and the count on the X
 * axis — the master spec's literal "horizontal" bar shape, distinct from the
 * shared `ChartRenderer`'s vertical bars used for the SQL playground's
 * auto-chart panel and this module's own grouped-bar view.
 */
export function FrequencyBar({ rows }: { rows: FrequencyRow[] }) {
  const height = Math.max(160, rows.length * 28);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fill: AXIS, fontSize: 11 }} stroke={AXIS} allowDecimals={false} />
        <YAxis type="category" dataKey="category" tick={{ fill: AXIS, fontSize: 11 }} stroke={AXIS} width={110} />
        <Tooltip />
        <Bar dataKey="count" fill={BAR_COLOR} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default FrequencyBar;
