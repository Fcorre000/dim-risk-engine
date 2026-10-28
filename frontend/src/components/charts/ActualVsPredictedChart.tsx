import { useMemo, useState } from 'react';
import type { ReviewPriority, ShipmentResult } from '../../types/api';
import { formatDollars, formatDollarsShort, zoneName } from '../../lib/metrics';
import { escapeFormula } from '../../lib/export';
import { useElementWidth } from '../../lib/useElementWidth';
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

// Charges run from a few dollars to a few thousand, so both axes are log:
// a linear scale crushed 95% of the dots into one corner.
const LOG_TICKS = [1, 3, 10, 30, 100, 300, 1000, 3000, 10000, 30000];
const FLOOR = 3;

function logDomain(maxV: number): { min: number; max: number; ticks: number[] } {
  const max = LOG_TICKS.find((t) => t >= maxV * 1.05) ?? LOG_TICKS[LOG_TICKS.length - 1];
  return { min: FLOOR, max, ticks: LOG_TICKS.filter((t) => t >= FLOOR && t <= max) };
}

export default function ActualVsPredictedChart({ data }: ActualVsPredictedChartProps) {
  const [selected, setSelected] = useState<ScatterPoint | null>(null);
  const [wrapRef, width, height] = useElementWidth<HTMLDivElement>(480, 320);
  const H = Math.max(280, height);

  const points = useMemo<ScatterPoint[]>(
    () =>
      data.map((r) => ({
        rowIndex: r.row_index,
        predicted: r.charge_predicted,
        actual: r.actual_net_charge,
        tracking: r.tracking_number,
        service: r.service_type,
        zone: r.zone,
        gap: r.actual_net_charge - r.charge_predicted,
        flag: r.review_priority,
      })),
    [data],
  );

  // Draw clear rows first so flagged dots sit on top
  const ordered = useMemo(() => {
    const rank = { low: 0, medium: 1, high: 2 } as const;
    return [...points].sort((a, b) => rank[a.flag] - rank[b.flag]);
  }, [points]);

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
          <svg width={width} height={H} className="absolute inset-0 block" role="img" aria-label="Per-shipment billed versus predicted charge">
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

            {ordered.map((p) => {
              const isSel = selected?.rowIndex === p.rowIndex;
              return (
                <circle
                  key={p.rowIndex}
                  cx={sx(p.predicted)}
                  cy={sy(p.actual)}
                  r={isSel ? 6 : p.flag === 'low' ? 2.5 : 3.5}
                  style={{
                    fill: COLOR[p.flag],
                    stroke: isSel ? 'var(--ink)' : 'none',
                    cursor: 'pointer',
                  }}
                  strokeWidth={isSel ? 2 : 0}
                  opacity={p.flag === 'low' && !isSel ? 0.6 : 0.9}
                  onClick={() => setSelected(isSel ? null : p)}
                >
                  <title>
                    {`${p.tracking ?? 'no tracking #'} · ${p.service} · ${zoneName(p.zone)} — billed ${formatDollars(p.actual)}, predicted ${formatDollars(p.predicted)}`}
                  </title>
                </circle>
              );
            })}
          </svg>
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
