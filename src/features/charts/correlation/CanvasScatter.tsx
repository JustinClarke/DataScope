import { useEffect, useRef } from 'react';

export interface ScatterPoint {
  x: number;
  y: number;
}

interface CanvasScatterProps {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
}

const HEIGHT = 320;
const PADDING = { top: 12, right: 16, bottom: 32, left: 48 };
const POINT_RADIUS = 1.5;
const POINT_COLOR = 'rgba(99, 102, 241, 0.35)'; // SERIES_COLORS[0] from ChartRenderer, alpha'd for density at high point counts

function niceRange(values: number[]): [number, number] {
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.05;
  return [min - pad, max + pad];
}

/**
 * §15's "Canvas-based rendering (D3 canvas mode) instead of SVG for scatter"
 * beyond 10k points — plain canvas 2D rather than a full charting-library
 * dependency, since the job here is "draw N dots fast," not axes/legends/
 * tooltips (the ordinary <10k path already gets those via `ChartRenderer`).
 * A dedicated canvas element, not an SVG-per-point, is what keeps this jank-
 * free at high point counts.
 */
export function CanvasScatter({ points, xLabel, yLabel }: CanvasScatterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = container.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = HEIGHT * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${HEIGHT}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, HEIGHT);

    if (points.length === 0) return;

    const [xMin, xMax] = niceRange(points.map((p) => p.x));
    const [yMin, yMax] = niceRange(points.map((p) => p.y));
    const plotWidth = width - PADDING.left - PADDING.right;
    const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

    const toPx = (x: number) => PADDING.left + ((x - xMin) / (xMax - xMin)) * plotWidth;
    const toPy = (y: number) => PADDING.top + plotHeight - ((y - yMin) / (yMax - yMin)) * plotHeight;

    // Canvas 2D can't resolve CSS custom properties directly — read the
    // computed values so axes/labels still match the active light/dark theme.
    const computed = getComputedStyle(container);
    const axisColor = computed.getPropertyValue('--color-border').trim() || '#c3c2b7';
    const labelColor = computed.getPropertyValue('--color-fg-muted').trim() || '#898781';

    // Axes
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PADDING.left, PADDING.top);
    ctx.lineTo(PADDING.left, PADDING.top + plotHeight);
    ctx.lineTo(PADDING.left + plotWidth, PADDING.top + plotHeight);
    ctx.stroke();

    // Points
    ctx.fillStyle = POINT_COLOR;
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(toPx(p.x), toPy(p.y), POINT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    // Axis labels + min/max ticks
    ctx.fillStyle = labelColor;
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(xLabel, PADDING.left + plotWidth / 2, HEIGHT - 6);
    ctx.fillText(xMin.toFixed(1), PADDING.left, HEIGHT - 18);
    ctx.fillText(xMax.toFixed(1), PADDING.left + plotWidth, HEIGHT - 18);

    ctx.save();
    ctx.translate(12, PADDING.top + plotHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
    ctx.textAlign = 'right';
    ctx.fillText(yMax.toFixed(1), PADDING.left - 6, PADDING.top + 4);
    ctx.fillText(yMin.toFixed(1), PADDING.left - 6, PADDING.top + plotHeight);
  }, [points, xLabel, yLabel]);

  return (
    <div ref={containerRef} className="w-full" data-testid="canvas-scatter">
      <canvas ref={canvasRef} role="img" aria-label={`Scatter plot of ${yLabel} vs ${xLabel}, ${points.length.toLocaleString()} points`} />
    </div>
  );
}
