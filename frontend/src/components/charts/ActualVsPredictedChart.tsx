import { useMemo, useState } from 'react';
import type { ShipmentResult } from '../../types/api';
import { formatDollars } from '../../lib/metrics';
import { escapeFormula } from '../../lib/export';
import CopyButton from '../ui/CopyButton';

interface ActualVsPredictedChartProps {
  data: ShipmentResult[];
}

type FlagType = 'unexpected' | 'review' | 'ok';

interface ScatterPoint {
  rowIndex: number;
  predicted: number;
  actual: number;
  tracking: string | null;
  service: string;
  zone: string;
  gap: number;
  flag: FlagType;
}

const W = 440;
const H = 380;
const P = 34;

function colorFor(flag: FlagType): string {
  if (flag === 'unexpected') return 'var(--crit)';
  if (flag === 'review') return 'var(--warn)';
  return 'var(--accent)';
}

export default function ActualVsPredictedChart({ data }: ActualVsPredictedChartProps) {
  const [selected, setSelected] = useState<ScatterPoint | null>(null);

  const points = useMemo<ScatterPoint[]>(
    () =>
      data.map((r) => ({
        rowIndex: r.row_index,
        predicted: r.predicted_net_charge,
        actual: r.actual_net_charge,
        tracking: r.tracking_number,
        service: r.service_type,
        zone: r.zone,
        gap: r.actual_net_charge - r.predicted_net_charge,
        flag: r.dim_anomaly === 'Unexpected' ? 'unexpected' : r.cost_anomaly === 'Review' ? 'review' : 'ok',
      })),
    [data],
  );

  const max = useMemo(() => {
    if (points.length === 0) return 100;
    return Math.max(...points.map((p) => Math.max(p.actual, p.predicted))) * 1.05;
  }, [points]);

  const sx = (v: number) => P + (v / max) * (W - P - 12);
  const sy = (v: number) => H - P - (v / max) * (H - P - 12);

  const isEmpty = data.length === 0;

  return (
    <figure
      className="border p-4 h-full"
      style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}
    >
      <div
        className="flex items-center justify-between text-[10px] tracking-widest mb-2"
        style={{ color: 'var(--muted)' }}
      >
        <span>&gt; FIG.02 · ACTUAL × PREDICTED</span>
        <span>N={points.length.toLocaleString()}</span>
      </div>

      {isEmpty ? (
        <div
          className="p-10 text-center text-[11px] tracking-widest"
          style={{ color: 'var(--muted)' }}
        >
          NO SIGNAL — INGEST AN INVOICE
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full"
          role="img"
          aria-label="Per-shipment actual vs predicted charge scatter"
        >
          {/* Gridlines */}
          {Array.from({ length: 5 }).map((_, i) => {
            const y = P + (i * (H - 2 * P)) / 4;
            return <line key={`h${i}`} x1={P} x2={W - 12} y1={y} y2={y} stroke="var(--border)" />;
          })}
          {Array.from({ length: 5 }).map((_, i) => {
            const x = P + (i * (W - P - 12)) / 4;
            return <line key={`v${i}`} x1={x} x2={x} y1={P} y2={H - P} stroke="var(--border)" />;
          })}

          {/* Diagonal y=x */}
          <line
            x1={sx(0)}
            y1={sy(0)}
            x2={sx(max)}
            y2={sy(max)}
            stroke="var(--accent)"
            strokeOpacity="0.45"
            strokeDasharray="4 3"
          />

          {/* Points */}
          {points.map((p) => {
            const isSel = selected?.rowIndex === p.rowIndex;
            const r = p.flag === 'ok' ? 1.5 : isSel ? 3.5 : 2.5;
            return (
              <circle
                key={p.rowIndex}
                cx={sx(p.predicted)}
                cy={sy(p.actual)}
                r={r}
                fill={colorFor(p.flag)}
                opacity={p.flag === 'ok' ? 0.4 : 0.95}
                stroke={isSel ? 'var(--text)' : 'none'}
                strokeWidth={isSel ? 1 : 0}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelected(p)}
              >
                <title>
                  {`${p.tracking ?? 'no tracking #'} — ${p.service} · Z${p.zone} — actual ${formatDollars(p.actual)} / predicted ${formatDollars(p.predicted)}`}
                </title>
              </circle>
            );
          })}

          <text x={W - 14} y={H - 8} textAnchor="end" fontSize="9" fill="var(--muted)" fontFamily="JetBrains Mono">
            predicted →
          </text>
          <text x={P + 2} y={P - 4} fontSize="9" fill="var(--muted)" fontFamily="JetBrains Mono">
            ↑ actual
          </text>
        </svg>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-5 mt-3 text-[10px] tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2" style={{ background: 'var(--crit)' }} />▲ UNEXPECTED
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2" style={{ background: 'var(--warn)' }} />■ REVIEW
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2" style={{ background: 'var(--accent)' }} />· OK
        </span>
      </div>

      {/* Selected detail card */}
      {selected && (
        <div
          className="mt-4 border p-3 text-[11px]"
          style={{ borderColor: 'var(--border)', background: 'var(--row-hov)' }}
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold" style={{ color: 'var(--text)' }}>
                  {selected.tracking ?? <span className="italic opacity-70">no tracking #</span>}
                </span>
                <span style={{ color: 'var(--muted)' }}>/ {selected.service} · Z{selected.zone}</span>
              </div>
              <div className="flex items-center gap-4 text-[11px] tabular-nums">
                <span style={{ color: 'var(--text)' }}>ACT {formatDollars(selected.actual)}</span>
                <span style={{ color: 'var(--muted)' }}>PRED {formatDollars(selected.predicted)}</span>
                <span style={{ color: selected.gap > 0 ? 'var(--crit)' : 'var(--accent)' }}>
                  {selected.gap >= 0 ? '+' : ''}{formatDollars(selected.gap)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <CopyButton text={escapeFormula(selected.tracking ?? '')} label="Tracking #" />
              <CopyButton text={formatDollars(selected.actual)} label="Actual" />
              <CopyButton text={formatDollars(selected.predicted)} label="Predicted" />
              <CopyButton text={`${selected.gap >= 0 ? '+' : ''}${formatDollars(selected.gap)}`} label="Gap" />
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Dismiss selection"
                className="px-2 py-1 text-[10px] tracking-widest uppercase cursor-pointer"
                style={{ color: 'var(--muted)' }}
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}
    </figure>
  );
}
