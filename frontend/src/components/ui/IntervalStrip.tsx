import type { ShipmentResult } from '../../types/api';
import { formatDollars } from '../../lib/metrics';

interface IntervalStripProps {
  row: Pick<ShipmentResult, 'actual_net_charge' | 'charge_predicted' | 'charge_lower_95' | 'charge_upper_95'>;
  width?: number;
}

/**
 * Where the bill landed against the model's 95% prediction interval.
 * Grey track = the interval, ink tick = point prediction, dot = what FedEx
 * billed (pink when it sits above the ceiling). Each row is scaled on its own
 * so the band always reads at the same size; the dollar figures carry magnitude.
 */
export default function IntervalStrip({ row, width = 132 }: IntervalStripProps) {
  const H = 18;
  const pad = 5;
  // The band always gets at least ~30% of the strip; a bill further out than
  // that is pinned to the end with a break mark so the band stays legible.
  const band = Math.max(row.charge_upper_95 - row.charge_lower_95, 0.01);
  const reach = band * 2.4;
  const lo = Math.max(Math.min(row.charge_lower_95, row.actual_net_charge), row.charge_lower_95 - reach);
  const hi = Math.min(Math.max(row.charge_upper_95, row.actual_net_charge), row.charge_upper_95 + reach);
  const span = hi - lo || 1;
  const clamp = (v: number) => Math.min(hi, Math.max(lo, v));
  const x = (v: number) => pad + ((clamp(v) - lo) / span) * (width - 2 * pad);
  const offRight = row.actual_net_charge > hi;
  const offLeft = row.actual_net_charge < lo;

  const over = row.actual_net_charge > row.charge_upper_95;
  const label = `Billed ${formatDollars(row.actual_net_charge)} against a predicted range of ${formatDollars(row.charge_lower_95)} to ${formatDollars(row.charge_upper_95)}`;

  return (
    <svg width={width} height={H} role="img" aria-label={label} className="block">
      <title>{label}</title>
      <line x1={pad} x2={width - pad} y1={H / 2} y2={H / 2} style={{ stroke: 'var(--line)' }} strokeWidth={2} strokeLinecap="round" />
      <line
        x1={x(row.charge_lower_95)}
        x2={x(row.charge_upper_95)}
        y1={H / 2}
        y2={H / 2}
        style={{ stroke: 'var(--line-strong)' }}
        strokeWidth={6}
        strokeLinecap="round"
      />
      <line
        x1={x(row.charge_predicted)}
        x2={x(row.charge_predicted)}
        y1={H / 2 - 5}
        y2={H / 2 + 5}
        style={{ stroke: 'var(--muted)' }}
        strokeWidth={1.5}
      />
      {(offRight || offLeft) && (
        <g style={{ stroke: 'var(--faint)' }} strokeWidth={1.25}>
          {[0, 4].map((d) => {
            const bx = offRight ? width - pad - 12 - d : pad + 8 + d;
            return <line key={d} x1={bx - 2} y1={H / 2 + 4} x2={bx + 2} y2={H / 2 - 4} />;
          })}
        </g>
      )}
      <circle
        cx={x(row.actual_net_charge)}
        cy={H / 2}
        r={4.5}
        style={{ fill: over ? 'var(--over)' : 'var(--billed)', stroke: 'var(--surface)' }}
        strokeWidth={2}
      />
    </svg>
  );
}
