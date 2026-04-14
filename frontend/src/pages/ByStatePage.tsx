import { useState, useMemo } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
} from 'react-simple-maps';
import type { UploadState } from '../types/api';
import { computeStateData, formatDollars } from '../lib/metrics';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

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

function getStateColor(count: number, maxCount: number): string {
  if (count === 0 || maxCount === 0) return '#1f2937';
  const t = Math.min(count / maxCount, 1);
  // Interpolate RGB: #1e3a5f (low) → #3b82f6 (high)
  const r = Math.round(30 + t * (59 - 30));
  const g = Math.round(58 + t * (130 - 58));
  const b = Math.round(95 + t * (246 - 95));
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

  const results = uploadState.results ?? [];
  const stateData = useMemo(() => computeStateData(results), [results]);

  const stateMap = useMemo(() => {
    const map: Record<string, typeof stateData[number]> = {};
    for (const d of stateData) map[d.state] = d;
    return map;
  }, [stateData]);

  const maxCount = stateData.length > 0 ? stateData[0].count : 0;
  const totalMapped = stateData.reduce((s, d) => s + d.count, 0);

  if (results.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">By State</h1>
          <p className="text-gray-500 text-sm mt-1">Shipment distribution across US states</p>
        </div>
        <div className="rounded-xl bg-gray-900 border border-gray-800 px-6 py-16 flex items-center justify-center">
          <p className="text-sm text-gray-500">Upload an invoice on the Overview page to see state analysis</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">By State</h1>
        <p className="text-gray-500 text-sm mt-1">
          {totalMapped.toLocaleString()} shipments mapped across {stateData.length} states
        </p>
      </div>

      {/* Map */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 px-6 py-5 relative">
        <h2 className="text-sm font-semibold text-gray-100 mb-1">Shipment Volume by State</h2>
        <p className="text-xs text-gray-500 mb-4">Hover over a state to see details</p>

        <ComposableMap
          projection="geoAlbersUsa"
          projectionConfig={{ scale: 1000 }}
          width={800}
          height={500}
          style={{ width: '100%', height: 'auto' }}
        >
          <Geographies geography={GEO_URL}>
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
                    fill={getStateColor(count, maxCount)}
                    stroke="#374151"
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
                      hover: { fill: '#60a5fa', outline: 'none', cursor: 'pointer' },
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
          <div className="absolute top-16 right-8 rounded-lg bg-gray-800 border border-gray-700 px-4 py-3 text-xs shadow-lg z-10 min-w-[180px]">
            <p className="font-semibold text-gray-100 mb-2">{tooltip.name} ({tooltip.abbr})</p>
            <div className="space-y-1">
              <p className="text-gray-400">Shipments: <span className="text-gray-200 font-medium">{tooltip.count.toLocaleString()}</span></p>
              <p className="text-gray-400">Total Billed: <span className="text-blue-400">{formatDollars(tooltip.actualTotal)}</span></p>
              <p className="text-gray-400">
                Gap: <span className={tooltip.gapTotal > 0 ? 'text-rose-400 font-medium' : 'text-emerald-400'}>
                  {tooltip.gapTotal >= 0 ? '+' : ''}{formatDollars(tooltip.gapTotal)}
                </span>
              </p>
              {tooltip.unexpected > 0 && (
                <p className="text-rose-400">Anomalies: {tooltip.unexpected}</p>
              )}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-2 mt-2 px-2">
          <span className="text-xs text-gray-500">Low</span>
          <div className="h-2 flex-1 rounded" style={{
            background: 'linear-gradient(to right, #1e3a5f, #3b82f6)'
          }} />
          <span className="text-xs text-gray-500">High</span>
          <span className="text-xs text-gray-600 ml-2">({maxCount.toLocaleString()} max)</span>
        </div>
      </div>

      {/* Summary table */}
      <div className="rounded-xl bg-gray-900 border border-gray-800">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-100">Top States by Shipment Volume</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" role="table" aria-label="State shipment summary">
            <thead>
              <tr className="border-b border-gray-800">
                {['State', 'Shipments', 'Total Actual', 'Total Predicted', 'Gap', 'Anomalies'].map((col) => (
                  <th key={col} scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stateData.map((d, idx) => (
                <tr
                  key={d.state}
                  className={[
                    'border-b border-gray-800/60 transition-colors duration-75',
                    idx % 2 === 0 ? 'bg-transparent' : 'bg-gray-800/20',
                    'hover:bg-gray-800/50',
                  ].join(' ')}
                >
                  <td className="px-4 py-3 text-gray-200 font-medium whitespace-nowrap">{d.state}</td>
                  <td className="px-4 py-3 text-gray-300 tabular-nums">{d.count.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-300 tabular-nums">{formatDollars(d.actualTotal)}</td>
                  <td className="px-4 py-3 text-gray-400 tabular-nums">{formatDollars(d.predictedTotal)}</td>
                  <td className={`px-4 py-3 tabular-nums font-medium ${d.gapTotal > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {d.gapTotal >= 0 ? '+' : ''}{formatDollars(d.gapTotal)}
                  </td>
                  <td className="px-4 py-3 text-gray-400 tabular-nums">
                    {d.unexpected > 0 ? (
                      <span className="text-rose-400">{d.unexpected}</span>
                    ) : (
                      '0'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
