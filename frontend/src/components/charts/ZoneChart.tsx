import { useId, useState } from 'react';
import type { ZoneDetailPoint } from '../../lib/metrics';
import { formatDollars, zoneName } from '../../lib/metrics';

interface ZoneChartProps {
  /** Per-zone financial detail, sorted by gapTotal descending. */
  data: ZoneDetailPoint[];
}

/**
 * Ranked bars: how far each zone's bills ran over (or under) the model's
 * point predictions. Hatched at rest, filled on hover, like the period chart.
 */
export default function ZoneChart({ data }: ZoneChartProps) {
  const id = useId().replace(/:/g, '');
  const [hover, setHover] = useState<string | null>(null);
  const maxAbs = Math.max(1, ...data.map((z) => Math.abs(z.gapTotal)));

  return (
    <div>
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <pattern id={`zh${id}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" style={{ fill: 'var(--hatch-bg)' }} />
            <line x1="0" y1="0" x2="0" y2="7" style={{ stroke: 'var(--hatch)' }} strokeWidth="1.5" />
          </pattern>
        </defs>
      </svg>
      <ul className="space-y-1" onMouseLeave={() => setHover(null)}>
      {data.map((z) => {
        const on = hover === z.zone;
        const over = z.gapTotal > 0;
        const pct = (Math.abs(z.gapTotal) / maxAbs) * 100;
        const hue = over ? 'var(--over)' : 'var(--billed)';
        return (
          <li
            key={z.zone}
            onMouseEnter={() => setHover(z.zone)}
            className="grid grid-cols-[72px_1fr_auto] items-center gap-4 rounded-[12px] px-3 py-2 transition-colors duration-150 sm:grid-cols-[96px_1fr_150px]"
            style={{ background: on ? 'var(--raised)' : 'transparent' }}
          >
            <span className="text-[14px]" style={{ color: 'var(--ink)' }}>{zoneName(z.zone)}</span>
            <svg className="block h-7 w-full" aria-hidden="true">
              <rect x="0" y="0" width={`${Math.max(pct, 0.5)}%`} height="28" rx="8"
                style={{ fill: on ? hue : `url(#zh${id})`, transition: 'fill 150ms ease-out' }} />
              {!on && <rect x="0" y="0" width="3" height="28" rx="1.5" style={{ fill: hue }} />}
            </svg>
            <span className="text-right">
              <span className="tnum block text-[14px]" style={{ color: over ? 'var(--over)' : 'var(--ink)' }}>
                {over ? '+' : ''}{formatDollars(z.gapTotal)}
              </span>
              <span className="meta tnum block">{z.count.toLocaleString()} shipments</span>
            </span>
          </li>
        );
      })}
      </ul>
    </div>
  );
}
