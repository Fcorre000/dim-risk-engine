import { useState, useMemo } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
} from 'react-simple-maps';
import type { UploadState } from '../types/api';
import { computeStateData, formatDollars } from '../lib/metrics';
import { useTheme } from '../theme/ThemeContext';
import { getPalette } from '../theme/variants';
// Bundled at build time from the pinned `us-atlas` npm dep (see package.json).
// Previously loaded from jsdelivr CDN at runtime — moved in-tree to eliminate
// the third-party supply-chain / MITM surface for map geometry.
import statesTopology from 'us-atlas/states-10m.json';

const NAME_TO_ABBR: Record<string, string> = {
  'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR',
  'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
  'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID',
  'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS',
  'Kentucky': 'KY', 'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD',
  'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS',
  'Missouri': 'MO', 'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV',
  'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
  'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK',
  'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC',
  'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT',
  'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA', 'West Virginia': 'WV',
  'Wisconsin': 'WI', 'Wyoming': 'WY', 'District of Columbia': 'DC',
};

function hexToRgb(hex: string): [number, number, number] {
  const s = hex.replace('#', '');
  const n = s.length === 3
    ? s.split('').map((c) => parseInt(c + c, 16))
    : [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  return [n[0], n[1], n[2]];
}

function mixColors(lo: [number, number, number], hi: [number, number, number], t: number): string {
  const r = Math.round(lo[0] + t * (hi[0] - lo[0]));
  const g = Math.round(lo[1] + t * (hi[1] - lo[1]));
  const b = Math.round(lo[2] + t * (hi[2] - lo[2]));
  return `rgb(${r}, ${g}, ${b})`;
}

interface TooltipData {
  name: string;
  abbr: string;
  count: number;
  actualTotal: number;
  gapTotal: number;
  unexpected: number;
}

interface ByStatePageProps {
  uploadState: UploadState;
}

export default function ByStatePage({ uploadState }: ByStatePageProps) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const { variant, theme } = useTheme();
  const palette = getPalette(variant, theme);

  const panelCol = hexToRgb(palette['--panel']);
  const accentCol = hexToRgb(palette['--accent']);
  const borderCol = palette['--border-2'];

  const results = uploadState.results ?? [];
  const stateData = useMemo(() => computeStateData(results), [results]);

  const stateMap = useMemo(() => {
    const map: Record<string, typeof stateData[number]> = {};
    for (const d of stateData) map[d.state] = d;
    return map;
  }, [stateData]);

  const maxCount = stateData.length > 0 ? stateData[0].count : 0;
  const totalMapped = stateData.reduce((s, d) => s + d.count, 0);

  function colorFor(count: number): string {
    if (count === 0 || maxCount === 0) return palette['--bg'];
    const t = Math.min(count / maxCount, 1);
    return mixColors(panelCol, accentCol, 0.2 + t * 0.8);
  }

  if (results.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-[11px] tracking-[0.18em] uppercase font-medium" style={{ color: 'var(--muted)' }}>
          &gt; 03 BY.STATE · SHIP.DENSITY.US
        </h1>
        <section className="border" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
          <div className="p-10 text-center text-[11px] tracking-widest" style={{ color: 'var(--muted)' }}>
            NO SIGNAL — INGEST AN INVOICE ON 00 OVERVIEW
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page title */}
      <div className="flex items-baseline justify-between">
        <h1 className="text-[11px] tracking-[0.18em] uppercase font-medium" style={{ color: 'var(--muted)' }}>
          &gt; 03 BY.STATE · SHIP.DENSITY.US
        </h1>
        <p className="text-[10px] tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
          N.MAPPED {totalMapped.toLocaleString()} · N.STATES {stateData.length}
        </p>
      </div>

      {/* Map panel */}
      <section className="border relative" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
        <div
          className="px-4 py-2 border-b flex items-center justify-between text-[10px] tracking-widest"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          <span>&gt; FIG.05 · CHOROPLETH · SHIPMENTS/STATE</span>
          <span>HOVER FOR DETAIL</span>
        </div>

        <div className="p-4">
          <ComposableMap
            projection="geoAlbersUsa"
            projectionConfig={{ scale: 1000 }}
            width={800}
            height={500}
            style={{ width: '100%', height: 'auto' }}
          >
            <Geographies geography={statesTopology}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const stateName = geo.properties.name;
                  const abbr = NAME_TO_ABBR[stateName];
                  const data = abbr ? stateMap[abbr] : undefined;
                  const count = data?.count ?? 0;

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={colorFor(count)}
                      stroke={borderCol}
                      strokeWidth={0.5}
                      onMouseEnter={() => {
                        if (abbr) {
                          setTooltip({
                            name: stateName,
                            abbr,
                            count,
                            actualTotal: data?.actualTotal ?? 0,
                            gapTotal: data?.gapTotal ?? 0,
                            unexpected: data?.unexpected ?? 0,
                          });
                        }
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      style={{
                        default: { outline: 'none' },
                        hover: { fill: palette['--accent'], outline: 'none', cursor: 'pointer' },
                        pressed: { outline: 'none' },
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ComposableMap>

          {/* Tooltip */}
          {tooltip && (
            <div
              className="absolute top-16 right-8 border px-3 py-2 text-[11px] z-10 min-w-[200px]"
              style={{ borderColor: 'var(--border-2)', background: 'var(--panel)', color: 'var(--text)' }}
            >
              <p className="text-[10px] tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
                &gt; STATE {tooltip.abbr} · {tooltip.name.toUpperCase()}
              </p>
              <div className="space-y-1 tabular-nums">
                <p style={{ color: 'var(--muted)' }}>
                  SHIPMENTS <span className="ml-2" style={{ color: 'var(--text)' }}>{tooltip.count.toLocaleString()}</span>
                </p>
                <p style={{ color: 'var(--muted)' }}>
                  ACT.SUM <span className="ml-2" style={{ color: 'var(--accent)', textShadow: 'var(--glow)' }}>
                    {formatDollars(tooltip.actualTotal)}
                  </span>
                </p>
                <p style={{ color: 'var(--muted)' }}>
                  GAP{' '}
                  <span
                    className="ml-2"
                    style={{ color: tooltip.gapTotal > 0 ? 'var(--crit)' : 'var(--accent)' }}
                  >
                    {tooltip.gapTotal >= 0 ? '+' : ''}{formatDollars(tooltip.gapTotal)}
                  </span>
                </p>
                {tooltip.unexpected > 0 && (
                  <p style={{ color: 'var(--crit)' }}>▲ UNEXPECTED {tooltip.unexpected}</p>
                )}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-2 mt-3 text-[9px] tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
            <span>LOW</span>
            <div
              className="h-2 flex-1"
              style={{
                background: `linear-gradient(to right, ${mixColors(panelCol, accentCol, 0.2)}, ${palette['--accent']})`,
              }}
            />
            <span>HIGH</span>
            <span className="ml-2 opacity-70">· MAX {maxCount.toLocaleString()}</span>
          </div>
        </div>
      </section>

      {/* Summary table */}
      <section className="border" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
        <div
          className="px-4 py-2 border-b flex items-center justify-between text-[10px] tracking-widest"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          <span>&gt; TBL.03 · STATE_SUMMARY</span>
          <span>ORDER.BY count DESC</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px] font-jb" role="table" aria-label="State shipment summary">
            <thead>
              <tr className="border-b text-[9px] tracking-widest" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                <th scope="col" className="px-4 py-2 text-left">STATE</th>
                <th scope="col" className="px-4 py-2 text-right">N</th>
                <th scope="col" className="px-4 py-2 text-right">ACT.SUM</th>
                <th scope="col" className="px-4 py-2 text-right">PRED.SUM</th>
                <th scope="col" className="px-4 py-2 text-right">GAP</th>
                <th scope="col" className="px-4 py-2 text-right">UNEXPECTED</th>
              </tr>
            </thead>
            <tbody>
              {stateData.map((d) => (
                <tr
                  key={d.state}
                  className="border-b transition-colors duration-150"
                  style={{ borderColor: 'var(--border)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--row-hov)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <td className="px-4 py-1.5 tabular-nums">{d.state}</td>
                  <td className="px-4 py-1.5 tabular-nums text-right" style={{ color: 'var(--muted)' }}>
                    {d.count.toLocaleString()}
                  </td>
                  <td className="px-4 py-1.5 tabular-nums text-right">{formatDollars(d.actualTotal)}</td>
                  <td className="px-4 py-1.5 tabular-nums text-right" style={{ color: 'var(--muted)' }}>
                    {formatDollars(d.predictedTotal)}
                  </td>
                  <td
                    className="px-4 py-1.5 tabular-nums text-right"
                    style={{ color: d.gapTotal > 0 ? 'var(--crit)' : d.gapTotal < 0 ? 'var(--accent)' : 'var(--muted)' }}
                  >
                    {d.gapTotal >= 0 ? '+' : ''}{formatDollars(d.gapTotal)}
                  </td>
                  <td
                    className="px-4 py-1.5 tabular-nums text-right"
                    style={{ color: d.unexpected > 0 ? 'var(--crit)' : 'var(--muted)' }}
                  >
                    {d.unexpected}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
