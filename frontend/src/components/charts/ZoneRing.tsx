import { memo } from 'react';
import type { ZoneShare } from '../../lib/metrics';
import { formatDollars, zoneName } from '../../lib/metrics';

interface ZoneRingProps {
  data: ZoneShare[];
}

// Top zones in the over-ceiling hue at falling strength; the rest hatched.
const STRENGTH = [1, 0.72, 0.5, 0.32];

/** Where the recoverable dollars sit, by pricing zone. */
function ZoneRing({ data }: ZoneRingProps) {
  const total = data.reduce((s, z) => s + z.recoverable, 0);
  const top = data.slice(0, 4);
  const rest = data.slice(4);
  const restSum = rest.reduce((s, z) => s + z.recoverable, 0);
  const parts = [
    ...top.map((z, i) => ({ key: z.zone, name: zoneName(z.zone), value: z.recoverable, opacity: STRENGTH[i], hatch: false })),
    ...(restSum > 0 ? [{ key: 'rest', name: `${rest.length} more zone${rest.length === 1 ? '' : 's'}`, value: restSum, opacity: 1, hatch: true }] : []),
  ];

  const S = 168;
  const R = 70;
  const STROKE = 16;
  const C = 2 * Math.PI * R;
  const GAP = parts.length > 1 ? 4 : 0;
  let offset = 0;

  const lead = top[0];
  const leadPct = lead && total > 0 ? Math.round((lead.recoverable / total) * 100) : 0;

  if (total <= 0) {
    return <p style={{ color: 'var(--muted)' }}>No flagged shipment was billed above the model's ceiling.</p>;
  }

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative flex-none" style={{ width: S, height: S }}>
        <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} role="img" aria-label="Recoverable dollars by zone">
          <g transform={`rotate(-90 ${S / 2} ${S / 2})`}>
            {parts.map((p) => {
              const len = Math.max(0, (p.value / total) * C - GAP);
              const el = (
                <circle
                  key={p.key}
                  cx={S / 2}
                  cy={S / 2}
                  r={R}
                  fill="none"
                  strokeWidth={STROKE}
                  strokeDasharray={`${len} ${C - len}`}
                  strokeDashoffset={-offset}
                  style={{ stroke: p.hatch ? 'var(--line-strong)' : 'var(--over)', strokeOpacity: p.opacity }}
                >
                  <title>{`${p.name}: ${formatDollars(p.value)}`}</title>
                </circle>
              );
              offset += (p.value / total) * C;
              return el;
            })}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="figure text-[32px] leading-9">{leadPct}%</span>
          <span className="meta mt-0.5">in {lead ? zoneName(lead.zone) : '—'}</span>
        </div>
      </div>

      <ul className="w-full min-w-0 space-y-2.5 text-[14px]">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2.5">
              <span
                className="dot"
                style={{ background: p.hatch ? 'var(--line-strong)' : 'var(--over)', opacity: p.opacity }}
              />
              <span className="truncate" style={{ color: 'var(--ink)' }}>{p.name}</span>
            </span>
            <span className="tnum flex-none" style={{ color: 'var(--ink)' }}>
              {Math.round((p.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default memo(ZoneRing);
