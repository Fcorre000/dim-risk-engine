import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { ReviewPriority, ShipmentResult } from '../../types/api';
import { formatDollars, formatDollarsShort, zoneName } from '../../lib/metrics';
import { escapeFormula } from '../../lib/export';
import { useElementWidth } from '../../lib/useElementWidth';
import { useCssVars } from '../../theme/ThemeContext';
import CopyButton from '../ui/CopyButton';
import Icon from '../ui/Icon';

interface ActualVsPredictedChartProps {
  data: ShipmentResult[];
}

interface ScatterPoint {
  rowIndex: number;
  predicted: number;
  actual: number;
  tracking: string | null;
  service: string;
  zone: string;
  gap: number;
  flag: ReviewPriority;
}

const LEFT = 48;
const BOTTOM = 28;
const TOP = 8;
const RIGHT = 8;

const COLOR: Record<ReviewPriority, string> = {
  high: 'var(--over)',
  medium: 'var(--warn)',
  low: 'var(--faint)',
};

// Dots are drawn on one <canvas>: an SVG <circle> (plus <title>) per shipment
// put ~100k nodes in the DOM at 50k rows and React re-diffed all of them on
// every render. Axes, labels and the selection ring stay in SVG.
const CANVAS_VARS = ['--over', '--warn', '--faint'] as const;
const CELL = 8; // hit-test grid cell, px
const HIT = 8;  // pick the nearest dot within this radius, px

interface Layout {
  xs: Float32Array;
  ys: Float32Array;
  grid: Map<number, number[]>;
}

// Charges run from a few dollars to a few thousand, so both axes are log:
// a linear scale crushed 95% of the dots into one corner.
const LOG_TICKS = [1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000];
const FLOOR = 3;

function logDomain(maxV: number): { min: number; max: number; ticks: number[] } {
  const max = LOG_TICKS.find((t) => t >= maxV * 1.05) ?? LOG_TICKS[LOG_TICKS.length - 1];
  return { min: FLOOR, max, ticks: LOG_TICKS.filter((t) => t >= FLOOR && t <= max) };
}

// Points for a results array, plus the same points grouped low → medium → high
// so flagged dots draw on top. Cached per array so remounting the Overview
// doesn't re-sort 50k rows.
const pointCache = new WeakMap<ShipmentResult[], { points: ScatterPoint[]; ordered: ScatterPoint[] }>();
function scatterPoints(data: ShipmentResult[]) {
  let hit = pointCache.get(data);
  if (!hit) {
    const points = data.map((r) => ({
      rowIndex: r.row_index,
      predicted: r.charge_predicted,
      actual: r.actual_net_charge,
      tracking: r.tracking_number,
      service: r.service_type,
      zone: r.zone,
      gap: r.actual_net_charge - r.charge_predicted,
      flag: r.review_priority,
    }));
    const rank = { low: 0, medium: 1, high: 2 } as const;
    const ordered = [...points].sort((a, b) => rank[a.flag] - rank[b.flag]);
    hit = { points, ordered };
    pointCache.set(data, hit);
  }
  return hit;
}

function ActualVsPredictedChart({ data }: ActualVsPredictedChartProps) {
  const [selected, setSelected] = useState<ScatterPoint | null>(null);
  const [hovered, setHovered] = useState<ScatterPoint | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const css = useCssVars(CANVAS_VARS);
  const [wrapRef, width, height] = useElementWidth<HTMLDivElement>(480, 320);
  const H = Math.max(280, height);

  const { points, ordered } = useMemo(() => scatterPoints(data), [data]);

  const { min, max, ticks } = useMemo(() => {
    let m = 0;
    for (const p of points) m = Math.max(m, p.actual, p.predicted);
    return logDomain(m || 100);
  }, [points]);

  const plotW = Math.max(100, width - LEFT - RIGHT);
  const plotH = H - TOP - BOTTOM;
  const lmin = Math.log10(min);
  const lspan = Math.log10(max) - lmin;
  const t = (v: number) => (Math.log10(Math.max(v, min)) - lmin) / lspan;
  const sx = (v: number) => LEFT + t(v) * plotW;
  const sy = (v: number) => TOP + plotH - t(v) * plotH;

  // Screen positions and a coarse grid for hover/click hit-testing
  const layout = useMemo<Layout>(() => {
    const n = ordered.length;
    const xs = new Float32Array(n);
    const ys = new Float32Array(n);
    const grid = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const x = sx(ordered[i].predicted);
      const y = sy(ordered[i].actual);
      xs[i] = x;
      ys[i] = y;
      const key = Math.floor(x / CELL) * 65536 + Math.floor(y / CELL);
      const bucket = grid.get(key);
      if (bucket) bucket.push(i); else grid.set(key, [i]);
    }
    return { xs, ys, grid };
    // sx/sy are pure functions of these values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordered, plotW, plotH, min, max]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, H);
    const fill: Record<ReviewPriority, string> = { high: css['--over'], medium: css['--warn'], low: css['--faint'] };
    // `ordered` is grouped low → medium → high, so one path per group keeps
    // flagged dots on top and costs three fills instead of 50k.
    let i = 0;
    while (i < ordered.length) {
      const flag = ordered[i].flag;
      const r = flag === 'low' ? 2.5 : 3.5;
      ctx.globalAlpha = flag === 'low' ? 0.6 : 0.9;
      ctx.fillStyle = fill[flag];
      ctx.beginPath();
      for (; i < ordered.length && ordered[i].flag === flag; i++) {
        ctx.moveTo(layout.xs[i] + r, layout.ys[i]);
        ctx.arc(layout.xs[i], layout.ys[i], r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, [layout, ordered, css, width, H]);

  function pick(e: React.MouseEvent<HTMLDivElement>): ScatterPoint | null {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    let best = -1;
    let bestD = HIT * HIT;
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const bucket = layout.grid.get(gx * 65536 + gy);
        if (!bucket) continue;
        for (const i of bucket) {
          const dx = layout.xs[i] - x;
          const dy = layout.ys[i] - y;
          const d = dx * dx + dy * dy;
          // ties go to the later (higher-priority, drawn-on-top) dot
          if (d <= bestD) { bestD = d; best = i; }
        }
      }
    }
    return best >= 0 ? ordered[best] : null;
  }

  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0 };
    for (const p of points) c[p.flag] += 1;
    return c;
  }, [points]);

  return (
    <figure className="card card-pad flex h-full flex-col">
      <div className="card-head">
        <figcaption className="card-title">Billed against the model</figcaption>
        <div className="flex items-center gap-4 text-[12px]" style={{ color: 'var(--muted)' }}>
          {(['high', 'medium', 'low'] as const).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="dot" style={{ background: COLOR[k] }} />
              {k === 'low' ? 'Clear' : k === 'high' ? 'High' : 'Medium'}
              <span className="tnum" style={{ color: 'var(--faint)' }}>{counts[k].toLocaleString()}</span>
            </span>
          ))}
        </div>
      </div>
      <p className="meta mt-1">One dot per shipment, predicted across and billed up, both on a log scale. Above the diagonal, FedEx billed more than the model expected.</p>

      <div ref={wrapRef} className="relative mt-4 min-h-[280px] min-w-0 flex-1">
        {data.length === 0 ? (
          <p className="py-16" style={{ color: 'var(--muted)' }}>Dots appear here once an invoice is scored.</p>
        ) : (
          <>
          <svg width={width} height={H} className="absolute inset-0 block" aria-hidden="true">
            {ticks.map((v, i) => (
              <g key={v}>
                <line x1={LEFT} x2={LEFT + plotW} y1={sy(v)} y2={sy(v)} style={{ stroke: i === 0 ? 'var(--line-strong)' : 'var(--grid)' }} />
                <text x={0} y={sy(v) + 4} fontSize={12} style={{ fill: 'var(--faint)' }}>{formatDollarsShort(v)}</text>
                {(i > 0 && (plotW >= 360 || i % 2 === ticks.length % 2)) && (
                  <text x={sx(v)} y={H - 8} fontSize={12} textAnchor={v === max ? 'end' : 'middle'} style={{ fill: 'var(--faint)' }}>
                    {formatDollarsShort(v)}
                  </text>
                )}
              </g>
            ))}

            {/* y = x: billed exactly what the model predicted */}
            <line x1={sx(min)} y1={sy(min)} x2={sx(max)} y2={sy(max)} style={{ stroke: 'var(--muted)' }} strokeDasharray="4 4" />
            <text x={sx(max) - 4} y={sy(max) + 16} fontSize={12} textAnchor="end" style={{ fill: 'var(--muted)' }}>
              Billed = predicted
            </text>

          </svg>
          <canvas
            ref={canvasRef}
            className="absolute inset-0 block"
            style={{ width, height: H }}
            role="img"
            aria-label={`Billed versus predicted charge for ${points.length.toLocaleString()} shipments: ${counts.high.toLocaleString()} high priority, ${counts.medium.toLocaleString()} medium, ${counts.low.toLocaleString()} clear`}
          />
          <svg width={width} height={H} className="pointer-events-none absolute inset-0 block" aria-hidden="true">
            {hovered && hovered.rowIndex !== selected?.rowIndex && (
              <circle cx={sx(hovered.predicted)} cy={sy(hovered.actual)} r={5} fill="none" style={{ stroke: 'var(--ink)' }} strokeWidth={1.5} />
            )}
            {selected && (
              <circle cx={sx(selected.predicted)} cy={sy(selected.actual)} r={6}
                style={{ fill: COLOR[selected.flag], stroke: 'var(--ink)' }} strokeWidth={2} />
            )}
          </svg>
          <div
            className="absolute inset-0"
            style={{ cursor: hovered ? 'pointer' : 'default' }}
            onMouseMove={(e) => {
              const p = pick(e);
              if (p?.rowIndex !== hovered?.rowIndex) setHovered(p);
            }}
            onMouseLeave={() => setHovered(null)}
            onClick={(e) => {
              const p = pick(e);
              setSelected(p && p.rowIndex !== selected?.rowIndex ? p : null);
            }}
          />
          {hovered && (
            <div
              className="float pointer-events-none absolute z-10 px-3 py-2 text-[13px]"
              style={{
                left: Math.min(sx(hovered.predicted) + 12, width - 230),
                top: Math.max(0, sy(hovered.actual) - 56),
                width: 218,
              }}
            >
              <p className="mono truncate" style={{ color: 'var(--ink)' }}>{hovered.tracking ?? 'no tracking #'}</p>
              <p className="tnum mt-0.5" style={{ color: 'var(--muted)' }}>
                {hovered.service} · {zoneName(hovered.zone)} · {formatDollars(hovered.actual)} billed, {formatDollars(hovered.predicted)} predicted
              </p>
            </div>
          )}
          </>
        )}
      </div>

      {selected && (
        <div className="mt-4 rounded-[14px] p-4" style={{ background: 'var(--raised)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="mono truncate" style={{ color: 'var(--ink)' }}>
                {selected.tracking ?? <span className="italic opacity-60">no tracking #</span>}
              </p>
              <p className="meta mt-1">{selected.service} · {zoneName(selected.zone)}</p>
            </div>
            <button type="button" onClick={() => setSelected(null)} aria-label="Dismiss selection" className="icon-btn -mr-2 -mt-2">
              <Icon name="x" size={16} />
            </button>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-[14px]">
            <div>
              <dt className="meta">Billed</dt>
              <dd className="tnum mt-0.5">{formatDollars(selected.actual)}</dd>
            </div>
            <div>
              <dt className="meta">Predicted</dt>
              <dd className="tnum mt-0.5">{formatDollars(selected.predicted)}</dd>
            </div>
            <div>
              <dt className="meta">Gap</dt>
              <dd className="tnum mt-0.5" style={{ color: selected.gap > 0 ? 'var(--over)' : 'var(--ink)' }}>
                {selected.gap >= 0 ? '+' : ''}{formatDollars(selected.gap)}
              </dd>
            </div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <CopyButton text={escapeFormula(selected.tracking ?? '')} label="Tracking #" />
            <CopyButton text={formatDollars(selected.actual)} label="Billed" />
            <CopyButton text={formatDollars(selected.predicted)} label="Predicted" />
            <CopyButton text={`${selected.gap >= 0 ? '+' : ''}${formatDollars(selected.gap)}`} label="Gap" />
          </div>
        </div>
      )}
    </figure>
  );
}

export default memo(ActualVsPredictedChart);
