import type { CorrelationMatrix } from '../../../lib/correlationSql';
import { correlationCellColor, correlationTextColor } from './correlationColor';

interface CorrelationHeatmapProps {
  matrix: CorrelationMatrix;
  selectedPair: [string, string] | null;
  onCellClick: (columnA: string, columnB: string) => void;
}

/**
 * §10 Module 4's heatmap grid. Off-diagonal cells are clickable — they drill
 * into the scatter view below (`ScatterDrillThrough`); the diagonal (always
 * `r = 1`, a column against itself) is shown but not clickable, since there's
 * no second variable to scatter against.
 */
export function CorrelationHeatmap({ matrix, selectedPair, onCellClick }: CorrelationHeatmapProps) {
  const { columns, values } = matrix;

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-xs" role="grid">
        <thead>
          <tr>
            <th className="p-1" />
            {columns.map((col) => (
              <th key={col} scope="col" className="p-1 font-medium text-(--color-fg-muted)">
                <span className="block max-w-20 truncate" title={col}>
                  {col}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {columns.map((rowCol, i) => (
            <tr key={rowCol}>
              <th scope="row" className="p-1 pr-2 text-right font-medium text-(--color-fg-muted)">
                <span className="block max-w-20 truncate" title={rowCol}>
                  {rowCol}
                </span>
              </th>
              {columns.map((colCol, j) => {
                const value = values[i][j];
                const isDiagonal = i === j;
                const isSelected =
                  selectedPair !== null &&
                  ((selectedPair[0] === rowCol && selectedPair[1] === colCol) ||
                    (selectedPair[0] === colCol && selectedPair[1] === rowCol));
                const bg = correlationCellColor(value);
                const label =
                  value === null
                    ? `${rowCol} vs ${colCol}: no data`
                    : `${rowCol} vs ${colCol}: ${value.toFixed(3)}`;

                return (
                  <td key={colCol} className="p-0">
                    <button
                      type="button"
                      disabled={isDiagonal}
                      onClick={() => onCellClick(rowCol, colCol)}
                      aria-label={label}
                      title={label}
                      style={{ backgroundColor: bg, color: correlationTextColor(bg) }}
                      className={`flex h-10 w-14 items-center justify-center font-mono text-[11px] transition-[outline] ${
                        isDiagonal ? 'cursor-default' : 'cursor-pointer hover:outline hover:outline-2 hover:outline-(--color-accent)'
                      } ${isSelected ? 'outline outline-2 outline-(--color-accent)' : ''}`}
                    >
                      {value === null ? '—' : value.toFixed(2)}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
