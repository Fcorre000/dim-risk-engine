import type { ZoneDetailPoint } from '../../lib/metrics';

interface ZoneChartProps {
  /** Per-zone financial detail. Required to surface recoverable-dollar polygon. */
  data: ZoneDetailPoint[];
  /** Title override (e.g. for full-width page). */
  title?: string;
}

const CX = 220;
const CY = 220;
const R = 150;

function fmt$k(v: number): string {
  return '$' + Math.round(v / 1000).toLocaleString('en-US') + 'k';
}

export default function ZoneChart({ data, title = '> FIG.01 · ZONE RECOVER × FLAG.RATE' }: ZoneChartProps) {
  if (data.length === 0) {
    return (
      <figure className="border p-4" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
        <div className="flex items-center justify-between text-[10px] tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
          <span>{title}</span>
          <span style={{ color: 'var(--muted)' }}>IDLE</span>
        </div>
        <div className="p-10 text-center text-[11px] tracking-widest" style={{ color: 'var(--muted)' }}>
          NO SIGNAL — INGEST AN INVOICE
        </div>
      </figure>
    );
  }

  // Use |gapTotal| for radius scale — falls back to shipment count when all gaps are zero
  const usableValue = (z: ZoneDetailPoint) => Math.max(0, z.gapTotal);
  let max = Math.max(...data.map(usableValue));
  let scaledBy: 'gap' | 'count' = 'gap';
  if (max <= 0) {
    max = Math.max(...data.map(z => z.count));
    scaledBy = 'count';
  }

  const pointFor = (z: ZoneDetailPoint, i: number, radius: number) => {
    const a = (i / data.length) * Math.PI * 2 - Math.PI / 2;
    const v = scaledBy === 'gap' ? usableValue(z) : z.count;
    const r = max > 0 ? (v / max) * radius : 0;
    return {
      angle: a,
      x: CX + Math.cos(a) * r,
      y: CY + Math.sin(a) * r,
    };
  };

  return (
    <figure className="border p-4" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
      <div className="flex items-center justify-between text-[10px] tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
        <span>{title}</span>
        <span style={{ color: 'var(--accent)', textShadow: 'var(--glow)' }}>ACTIVE</span>
      </div>
      <div className="relative mx-auto w-full" style={{ aspectRatio: '1 / 1', maxWidth: 440 }}>
        <svg
          viewBox="0 0 440 440"
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full"
          role="img"
          aria-label="Zone radar: recoverable dollars and flag rate by pricing zone"
        >
          {/* Concentric rings */}
          {[0.25, 0.5, 0.75, 1].map((r, i) => (
            <circle key={i} cx={CX} cy={CY} r={R * r} fill="none" stroke="var(--border)" />
          ))}

          {/* Spokes */}
          {data.map((_, i) => {
            const a = (i / data.length) * Math.PI * 2 - Math.PI / 2;
            return (
              <line
                key={i}
                x1={CX}
                y1={CY}
                x2={CX + Math.cos(a) * R}
                y2={CY + Math.sin(a) * R}
                stroke="var(--border)"
              />
            );
          })}

          {/* Data polygon */}
          <polygon
            points={data
              .map((z, i) => {
                const p = pointFor(z, i, R);
                return `${p.x},${p.y}`;
              })
              .join(' ')}
            fill="var(--accent)"
            fillOpacity="0.15"
            stroke="var(--accent)"
            strokeWidth="1.5"
          />

          {/* Vertices + labels */}
          {data.map((z, i) => {
            const p = pointFor(z, i, R);
            const a = p.angle;
            const lx = CX + Math.cos(a) * (R + 22);
            const ly = CY + Math.sin(a) * (R + 22);
            const vx = CX + Math.cos(a) * (R + 38);
            const vy = CY + Math.sin(a) * (R + 38);
            return (
              <g key={z.zone}>
                <circle cx={p.x} cy={p.y} r="4" fill="var(--accent)" />
                <text
                  x={lx}
                  y={ly}
                  fontSize="12"
                  fill="var(--text)"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="JetBrains Mono"
                  fontWeight="600"
                >
                  {`Z${z.zone}`}
                </text>
                <text
                  x={vx}
                  y={vy}
                  fontSize="10"
                  fill="var(--accent)"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="JetBrains Mono"
                >
                  {scaledBy === 'gap' ? fmt$k(Math.max(0, z.gapTotal)) : `${z.count}`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
}
