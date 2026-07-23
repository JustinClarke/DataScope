import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import type { ChartSpec, QueryResult } from '../../types';
import { buildChart } from '../../lib/chartMapper';

// Shared chart primitive: renders a typed ChartSpec against its result. The
// charting library is heavy, so this component is the lazy boundary — nothing
// here is imported until an actual chart is shown. The full chart modules
// reuse this renderer rather than re-wiring the library per module.

// A small, distinct series palette that reads in both light and dark themes.
const SERIES_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#a855f7'];
const AXIS = 'var(--color-fg-muted)';
const GRID = 'var(--color-border)';

function axisTick() {
  return { fill: AXIS, fontSize: 11 };
}

export default function ChartRenderer({ result, spec }: { result: QueryResult; spec: ChartSpec }) {
  const data = buildChart(result, spec);

  if (spec.type === 'correlation') {
    const yField = spec.yFields[0];
    return (
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 12, right: 16, bottom: 24, left: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey={spec.xField}
            name={spec.xField}
            tick={axisTick()}
            stroke={AXIS}
            label={{ value: spec.xField, position: 'insideBottom', offset: -12, fill: AXIS, fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey={yField}
            name={yField}
            tick={axisTick()}
            stroke={AXIS}
            label={{ value: yField, angle: -90, position: 'insideLeft', fill: AXIS, fontSize: 11 }}
          />
          <ZAxis range={[36, 36]} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
          <Scatter data={data} fill={SERIES_COLORS[0]} />
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  const ChartComponent = spec.type === 'time-series' ? LineChart : BarChart;

  return (
    <ResponsiveContainer width="100%" height={320}>
      <ChartComponent data={data} margin={{ top: 12, right: 16, bottom: 24, left: 8 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
        <XAxis
          dataKey={spec.xField}
          tick={axisTick()}
          stroke={AXIS}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis tick={axisTick()} stroke={AXIS} />
        <Tooltip />
        {spec.yFields.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
        {spec.yFields.map((field, i) =>
          spec.type === 'time-series' ? (
            <Line
              key={field}
              type="monotone"
              dataKey={field}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              dot={false}
              connectNulls
            />
          ) : (
            <Bar key={field} dataKey={field} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
          ),
        )}
      </ChartComponent>
    </ResponsiveContainer>
  );
}
