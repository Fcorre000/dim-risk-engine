import type { UploadState } from '../types/api';
import { computeZoneData, computeZoneDetails, formatDollars } from '../lib/metrics';
import ZoneChart from '../components/charts/ZoneChart';

interface ByZonePageProps {
  uploadState: UploadState;
}

export default function ByZonePage({ uploadState }: ByZonePageProps) {
  const results = uploadState.results ?? [];
  const zoneData = computeZoneData(results);
  const zoneDetails = computeZoneDetails(results);

  if (results.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">By Zone</h1>
          <p className="text-gray-500 text-sm mt-1">DIM flag rate and cost gap per pricing zone</p>
        </div>
        <div className="rounded-xl bg-gray-900 border border-gray-800 px-6 py-16 flex items-center justify-center">
          <p className="text-sm text-gray-500">Upload an invoice on the Overview page to see zone analysis</p>
        </div>
      </div>
    );
  }

  const totalGap = zoneDetails.reduce((sum, z) => sum + z.gapTotal, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">By Zone</h1>
        <p className="text-gray-500 text-sm mt-1">
          DIM flag rate and cost gap across {zoneDetails.length} pricing zones
          {totalGap > 0 && (
            <span className="ml-2 text-rose-400 font-medium">
              Total gap: +{formatDollars(totalGap)}
            </span>
          )}
        </p>
      </div>

      {/* DIM flag rate chart */}
      <ZoneChart data={zoneData} />

      {/* Zone stats table */}
      <div className="rounded-xl bg-gray-900 border border-gray-800">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-100">Zone Summary</h2>
          <p className="text-xs text-gray-500 mt-0.5">Sorted by total cost gap — highest overcharge zones first</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" role="table" aria-label="Zone cost summary table">
            <thead>
              <tr className="border-b border-gray-800">
                {['Zone', 'Shipments', 'DIM Flag Rate', 'Unexpected', 'Total Actual', 'Total Predicted', 'Total Gap'].map((col) => (
                  <th
                    key={col}
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zoneDetails.map((zone, idx) => (
                <tr
                  key={zone.zone}
                  className={[
                    'border-b border-gray-800/60 transition-colors duration-75',
                    idx % 2 === 0 ? 'bg-transparent' : 'bg-gray-800/20',
                    'hover:bg-gray-800/50',
                  ].join(' ')}
                >
                  <td className="px-4 py-3 font-medium text-gray-100 whitespace-nowrap">
                    Zone {zone.zone}
                  </td>
                  <td className="px-4 py-3 text-gray-400 tabular-nums whitespace-nowrap">
                    {zone.count.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`font-medium ${zone.dimRate > 50 ? 'text-rose-400' : zone.dimRate > 25 ? 'text-amber-400' : 'text-blue-400'}`}>
                      {zone.dimRate}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 tabular-nums whitespace-nowrap">
                    {zone.unexpected > 0 ? (
                      <span className="text-rose-400 font-medium">{zone.unexpected}</span>
                    ) : (
                      <span className="text-gray-600">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-300 tabular-nums whitespace-nowrap">
                    {formatDollars(zone.actualTotal)}
                  </td>
                  <td className="px-4 py-3 text-gray-400 tabular-nums whitespace-nowrap">
                    {formatDollars(zone.predictedTotal)}
                  </td>
                  <td className={`px-4 py-3 tabular-nums font-medium whitespace-nowrap ${zone.gapTotal > 0 ? 'text-rose-400' : zone.gapTotal < 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                    {zone.gapTotal >= 0 ? '+' : ''}{formatDollars(zone.gapTotal)}
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
