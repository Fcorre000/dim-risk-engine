import { memo, useEffect, useId, useMemo, useState } from 'react';
import type { PeriodPoint, TrendsGranularity } from '../../lib/metrics';
import { formatDollars, formatDollarsShort } from '../../lib/metrics';
import { useElementWidth } from '../../lib/useElementWidth';

interface PeriodChartProps {
  points: PeriodPoint[];
  granularity: TrendsGranularity;
  height?: number;
}

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function niceStep(x: number): number {
  if (x <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / p;
  if (m <= 1) return p;
  if (m <= 2) return 2 * p;
  if (m <= 2.5) return 2.5 * p;
  if (m <= 5) return 5 * p;
  return 10 * p;
}

function longLabel(p: PeriodPoint, g: TrendsGranularity): string {
  if (g === 'month') {
    const [y, m] = p.key.split('-');
    return `${MONTHS_LONG[parseInt(m, 10) - 1]} ${y}`;
  }
  if (g === 'week') return `Week of ${p.label}`;
  return `${p.label}, ${p.key.slice(0, 4)}`;
}

/** Two-line tick for months ("Jun" over "2024" at January and the first bar). */
function tickLines(p: PeriodPoint, g: TrendsGranularity, i: number): [string, string | null] {
  if (g !== 'month') return [p.label, null];
  const [mon, year] = p.label.split(' ');
  return [mon, i === 0 || mon === 'Jan' ? year : null];
}

/** Legend swatch: the bar mark itself, scaled down. */
export function BarSwatch({ cap }: { cap: 'top' | 'bottom' }) {
  const id = useId().replace(/:/g, '');
  const color = cap === 'top' ? 'var(--billed)' : 'var(--over)';
  return (
    <svg width="14" height="14" aria-hidden="true" className="flex-none">
      <defs>
        <pattern id={`sw${id}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" style={{ fill: 'var(--hatch-bg)' }} />
          <line x1="0" y1="0" x2="0" y2="5" style={{ stroke: 'var(--hatch)' }} strokeWidth="2" />
        </pattern>
      </defs>
      <rect x="0.5" y="0.5" width="13" height="13" rx="4" fill={`url(#sw${id})`} />
      <rect x="0.5" y={cap === 'top' ? 0.5 : 11} width="13" height="2.5" rx="1.25" style={{ fill: color }} />
    </svg>
  );
}

/**
 * Billed per period above the zero line; below it, the part of that bill that
 * landed above the model's 95% ceiling on flagged shipments (what the audit
 * can claim back). One dollar scale for both sides. Unselected periods are
 * hatched; the selected one fills in.
 */
function PeriodChart({ points, granularity, height = 300 }: PeriodChartProps) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>(720);
  const patternId = `hatch${useId().replace(/:/g, '')}`;

  const peakIndex = useMemo(() => {
    let best = 0;
    points.forEach((p, i) => { if (p.overCeiling > points[best].overCeiling) best = i; });
    return best;
  }, [points]);

  const [pinned, setPinned] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  useEffect(() => { setPinned(null); }, [points.length, granularity]);
  const active = hovered ?? pinned ?? peakIndex;

  const LEFT = 52;
  const TOP = 8;
  const BOTTOM = 36;
  const plotW = Math.max(120, width - LEFT);
  const plotH = height - TOP - BOTTOM;

  const maxB = Math.max(0, ...points.map((p) => p.billed));
  const maxO = Math.max(0, ...points.map((p) => p.overCeiling));
  const step = niceStep((maxB + maxO) / 5);
  const topTicks = Math.max(1, Math.ceil(maxB / step));
  const botTicks = maxO > 0 ? Math.max(1, Math.ceil(maxO / step)) : 0;
  const domain = (topTicks + botTicks) * step || 1;
  const px = plotH / domain;
  const zeroY = TOP + topTicks * step * px;

  const n = Math.max(points.length, 1);
  const slot = plotW / n;
  const barW = Math.max(3, Math.min(56, slot * 0.7));
  const rx = Math.min(10, barW / 4);
  const gap = 3;

  const maxLabels = Math.max(2, Math.floor(plotW / 58));
  const labelEvery = Math.ceil(n / maxLabels);

  const ticks: { y: number; label: string; zero?: boolean }[] = [];
  for (let k = topTicks; k >= 1; k--) ticks.push({ y: zeroY - k * step * px, label: formatDollarsShort(k * step) });
  ticks.push({ y: zeroY, label: '$0', zero: true });
  for (let k = 1; k <= botTicks; k++) ticks.push({ y: zeroY + k * step * px, label: formatDollarsShort(k * step) });

  const cur = points[active];
  const cx = LEFT + slot * active + slot / 2;
  const narrow = width < 560;
  const tipW = 236;
  const tipOnRight = cx + barW / 2 + 12 + tipW <= width;
  const tipLeft = tipOnRight ? cx + barW / 2 + 12 : Math.max(0, cx - barW / 2 - 12 - tipW);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight') { e.preventDefault(); setPinned(Math.min(points.length - 1, active + 1)); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setPinned(Math.max(0, active - 1)); }
    if (e.key === 'Home') { e.preventDefault(); setPinned(0); }
    if (e.key === 'End') { e.preventDefault(); setPinned(points.length - 1); }
  }

  if (points.length === 0) {
    return (
      <div ref={wrapRef} className="flex items-center" style={{ height }}>
        <p style={{ color: 'var(--muted)' }}>No shipment dates in this file, so there is nothing to plot by period.</p>
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="relative rounded-[14px] outline-offset-4"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseLeave={() => setHovered(null)}
      aria-label={`Billed and over-ceiling dollars by ${granularity}. Use the arrow keys to move between periods.`}
    >
      <svg width={width} height={height} className="block" role="img" aria-hidden="true">
        <defs>
          <pattern id={patternId} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" style={{ fill: 'var(--hatch-bg)' }} />
            <line x1="0" y1="0" x2="0" y2="7" style={{ stroke: 'var(--hatch)' }} strokeWidth="1.5" />
          </pattern>
        </defs>

        {/* active column band */}
        <rect
          x={LEFT + slot * active + (slot - Math.min(slot, barW + 16)) / 2}
          y={TOP - 4}
          width={Math.min(slot, barW + 16)}
          height={plotH + 8}
          rx={12}
          style={{ fill: 'var(--raised)', transition: 'x 150ms ease-out' }}
        />

        {ticks.map((t) => (
          <g key={`${t.y}-${t.label}`}>
            <line
              x1={LEFT}
              x2={width}
              y1={t.y}
              y2={t.y}
              style={{ stroke: t.zero ? 'var(--line-strong)' : 'var(--grid)' }}
              strokeWidth={1}
            />
            <text x={0} y={t.y + 4} fontSize={12} style={{ fill: 'var(--faint)' }} className="tnum">
              {t.label}
            </text>
          </g>
        ))}

        {points.map((p, i) => {
          const on = i === active;
          const x = LEFT + slot * i + (slot - barW) / 2;
          const hTop = Math.max(0, p.billed * px - gap);
          const hBot = Math.max(0, p.overCeiling * px - gap);
          const capH = Math.min(3, hTop);
          const capB = Math.min(3, hBot);
          return (
            <g key={p.key}>
              {hTop > 0 && (
                <>
                  <rect
                    x={x} y={zeroY - gap - hTop} width={barW} height={hTop} rx={Math.min(rx, hTop / 2)}
                    style={{ fill: on ? 'var(--billed)' : `url(#${patternId})`, transition: 'fill 150ms ease-out' }}
                  />
                  {!on && <rect x={x} y={zeroY - gap - hTop} width={barW} height={capH} rx={capH / 2} style={{ fill: 'var(--billed)' }} />}
                </>
              )}
              {hBot > 0 && (
                <>
                  <rect
                    x={x} y={zeroY + gap} width={barW} height={hBot} rx={Math.min(rx, hBot / 2)}
                    style={{ fill: on ? 'var(--over)' : `url(#${patternId})`, transition: 'fill 150ms ease-out' }}
                  />
                  {!on && <rect x={x} y={zeroY + gap + hBot - capB} width={barW} height={capB} rx={capB / 2} style={{ fill: 'var(--over)' }} />}
                </>
              )}
              {/* hit area */}
              <rect
                x={LEFT + slot * i}
                y={TOP}
                width={slot}
                height={plotH}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHovered(i)}
                onClick={() => setPinned(i)}
              />
            </g>
          );
        })}

        {points.map((p, i) => {
          if (i !== active && i % labelEvery !== 0) return null;
          // keep a hidden neighbour from colliding with the active label
          if (i !== active && Math.abs(i - active) * slot < 40) return null;
          const [l1, l2] = tickLines(p, granularity, i);
          const x = LEFT + slot * i + slot / 2;
          return (
            <text
              key={`t${p.key}`}
              x={x}
              y={height - BOTTOM + 20}
              textAnchor="middle"
              fontSize={12}
              style={{ fill: i === active ? 'var(--ink)' : 'var(--faint)' }}
            >
              {l1}
              {l2 && <tspan x={x} dy={14} style={{ fill: 'var(--faint)' }}>{l2}</tspan>}
            </text>
          );
        })}
      </svg>

      {cur && (
        <div
          className={narrow ? 'mt-3 rounded-[14px] p-4' : 'float pointer-events-none absolute p-4'}
          style={narrow ? { background: 'var(--raised)' } : { top: TOP, left: tipLeft, width: tipW }}
          aria-live="polite"
        >
          <p className="text-[13px]" style={{ color: 'var(--muted)' }}>{longLabel(cur, granularity)}</p>
          <dl className="mt-3 space-y-2 text-[14px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                <span className="dot" style={{ background: 'var(--billed)' }} />Billed
              </dt>
              <dd className="tnum" style={{ color: 'var(--ink)' }}>{formatDollars(cur.billed)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                <span className="dot" style={{ background: 'var(--over)' }} />Over ceiling
              </dt>
              <dd className="tnum" style={{ color: 'var(--ink)' }}>{formatDollars(cur.overCeiling)}</dd>
            </div>
          </dl>
          <p className="meta tnum mt-3">
            {cur.flagged.toLocaleString()} of {cur.count.toLocaleString()} shipments flagged
          </p>
        </div>
      )}
    </div>
  );
}

export default memo(PeriodChart);
