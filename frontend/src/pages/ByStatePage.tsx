import { useState, useMemo } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
} from 'react-simple-maps';
import type { PageId, UploadState } from '../types/api';
import { computeStateData, formatDollars } from '../lib/metrics';
import { useCssVars } from '../theme/ThemeContext';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
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

const ABBR_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(NAME_TO_ABBR).map(([name, abbr]) => [abbr, name]),
);

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
  highPriority: number;
}

interface ByStatePageProps {
  uploadState: UploadState;
  onNavigate: (page: PageId) => void;
}

const VARS = ['--raised', '--billed', '--surface', '--ink', '--line'] as const;

export default function ByStatePage({ uploadState, onNavigate }: ByStatePageProps) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const css = useCssVars(VARS);

  const results = useMemo(() => uploadState.results ?? [], [uploadState.results]);
  const stateData = useMemo(() => computeStateData(results), [results]);

  const stateMap = useMemo(() => {
    const map: Record<string, typeof stateData[number]> = {};
    for (const d of stateData) map[d.state] = d;
    return map;
  }, [stateData]);

  const maxCount = stateData.length > 0 ? stateData[0].count : 0;
  const totalMapped = stateData.reduce((s, d) => s + d.count, 0);

  // Sequential ramp in the billed hue, from one step above the card to full strength
  const lo = hexToRgb(css['--raised'] || '#1b1b1b');
  const hi = hexToRgb(css['--billed'] || '#6f9dff');
  function colorFor(count: number): string {
    if (count === 0 || maxCount === 0) return css['--raised'];
    const t = Math.min(count / maxCount, 1);
    return mixColors(lo, hi, 0.18 + Math.sqrt(t) * 0.82);
  }

  if (results.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="States" sub="Where your shipments go, and what each state was billed." />
        <section className="card">
          <EmptyState onGoToOverview={() => onNavigate('overview')}>
            No invoice scored yet. The map fills in once one is.
          </EmptyState>
        </section>
      </div>
    );
  }

  const top = stateData.slice(0, 12);
  const unmapped = results.length - totalMapped;

  return (
    <div className="space-y-6">
      <PageHeader
        title="States"
        sub={
          <span className="tnum">
            {totalMapped.toLocaleString()} shipments to {stateData.length} recipient states
            {unmapped > 0 && <> · {unmapped.toLocaleString()} without a recipient state</>}
          </span>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card card-pad relative" aria-label="Shipments by state map">
          <div className="card-head">
            <h2 className="card-title">Shipments by recipient state</h2>
            <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--faint)' }}>
              <span>1</span>
              <span
                className="h-2 w-28 rounded-full"
                style={{ background: `linear-gradient(to right, ${mixColors(lo, hi, 0.18)}, ${css['--billed']})` }}
                aria-hidden="true"
              />
              <span className="tnum">{maxCount.toLocaleString()}</span>
            </div>
          </div>

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
                      stroke={css['--surface']}
                      strokeWidth={0.75}
                      onMouseEnter={() => {
                        if (abbr) {
                          setTooltip({
                            name: stateName,
                            abbr,
                            count,
                            actualTotal: data?.actualTotal ?? 0,
                            gapTotal: data?.gapTotal ?? 0,
                            highPriority: data?.highPriority ?? 0,
                          });
                        }
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      style={{
                        default: { outline: 'none' },
                        hover: { fill: css['--ink'], outline: 'none', cursor: 'pointer' },
                        pressed: { outline: 'none' },
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ComposableMap>

          {tooltip && (
            <div className="float pointer-events-none absolute right-6 top-20 z-10 w-[220px] p-4">
              <p style={{ color: 'var(--ink)' }}>{tooltip.name}</p>
              <dl className="mt-3 space-y-1.5 text-[14px]">
                <div className="flex justify-between gap-3">
                  <dt style={{ color: 'var(--muted)' }}>Shipments</dt>
                  <dd className="tnum">{tooltip.count.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt style={{ color: 'var(--muted)' }}>Billed</dt>
                  <dd className="tnum">{formatDollars(tooltip.actualTotal)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt style={{ color: 'var(--muted)' }}>Gap</dt>
                  <dd className="tnum" style={{ color: tooltip.gapTotal > 0 ? 'var(--over)' : 'var(--ink)' }}>
                    {tooltip.gapTotal >= 0 ? '+' : ''}{formatDollars(tooltip.gapTotal)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt style={{ color: 'var(--muted)' }}>High priority</dt>
                  <dd className="tnum" style={{ color: tooltip.highPriority > 0 ? 'var(--over)' : 'var(--ink)' }}>
                    {tooltip.highPriority.toLocaleString()}
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </section>

        <section className="card card-pad" aria-label="Top states">
          <h2 className="card-title">Busiest states</h2>
          <p className="meta mt-0.5">By shipment count</p>
          <ol className="mt-5 space-y-[18px]">
            {top.map((d) => (
              <li key={d.state}>
                <div className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span style={{ color: 'var(--ink)' }}>{ABBR_TO_NAME[d.state] ?? d.state}</span>
                  <span className="tnum" style={{ color: 'var(--ink)' }}>
                    {d.count.toLocaleString()}{' '}
                    <span style={{ color: 'var(--faint)' }}>{formatDollars(d.actualTotal)}</span>
                  </span>
                </div>
                <div className="mt-2 h-1 w-full rounded-full" style={{ background: 'var(--raised)' }}>
                  <div className="h-full rounded-full" style={{ width: `${(d.count / maxCount) * 100}%`, background: 'var(--billed)' }} />
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="card overflow-hidden" aria-label="State summary">
        <div className="px-[22px] pb-3 pt-[22px]">
          <h2 className="card-title">All states</h2>
          <p className="meta mt-0.5">Most shipments first</p>
        </div>
        <div className="overflow-x-auto">
          <table className="table" aria-label="State shipment summary">
            <thead>
              <tr>
                <th scope="col">State</th>
                <th scope="col" className="num">Shipments</th>
                <th scope="col" className="num">Billed</th>
                <th scope="col" className="num">Predicted</th>
                <th scope="col" className="num">Gap</th>
                <th scope="col" className="num">High priority</th>
              </tr>
            </thead>
            <tbody>
              {stateData.map((d) => (
                <tr key={d.state}>
                  <td>
                    <span style={{ color: 'var(--ink)' }}>{ABBR_TO_NAME[d.state] ?? d.state}</span>{' '}
                    <span style={{ color: 'var(--faint)' }}>{d.state}</span>
                  </td>
                  <td className="num" style={{ color: 'var(--muted)' }}>{d.count.toLocaleString()}</td>
                  <td className="num">{formatDollars(d.actualTotal)}</td>
                  <td className="num" style={{ color: 'var(--muted)' }}>{formatDollars(d.predictedTotal)}</td>
                  <td className="num" style={{ color: d.gapTotal > 0 ? 'var(--over)' : 'var(--ink)' }}>
                    {d.gapTotal >= 0 ? '+' : ''}{formatDollars(d.gapTotal)}
                  </td>
                  <td className="num" style={{ color: d.highPriority > 0 ? 'var(--over)' : 'var(--muted)' }}>
                    {d.highPriority.toLocaleString()}
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
