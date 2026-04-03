import type { UploadState } from '../types/api';
import { computeSkuData, formatDollars } from '../lib/metrics';

interface BySkuPageProps {
  uploadState: UploadState;
}

export default function BySkuPage({ uploadState }: BySkuPageProps) {
  const results = uploadState.results ?? [];
  const skuData = computeSkuData(results);

  if (results.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">By SKU</h1>
          <p className="text-gray-500 text-sm mt-1">Anomaly statistics by FedEx service type</p>
        </div>
        <div className="rounded-xl bg-gray-900 border border-gray-800 px-6 py-16 flex items-center justify-center">
          <p className="text-sm text-gray-500">Upload an invoice on the Overview page to see SKU analysis</p>
        </div>
      </div>
    );
  }

  const totalGap = skuData.reduce((sum, s) => sum + s.gapTotal, 0);
  const totalUnexpected = skuData.reduce((sum, s) => sum + s.unexpected, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">By SKU</h1>
        <p className="text-gray-500 text-sm mt-1">
          {skuData.length} service types · {totalUnexpected.toLocaleString()} unexpected anomalies
          {totalGap > 0 && (
            <span className="ml-2 text-rose-400 font-medium">
              Total gap: +{formatDollars(totalGap)}
            </span>
          )}
        </p>
      </div>

      <div className="rounded-xl bg-gray-900 border border-gray-800">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-100">Service Type Summary</h2>
          <p className="text-xs text-gray-500 mt-0.5">Sorted by total cost gap — highest overcharge service types first</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" role="table" aria-label="Service type anomaly summary table">
            <thead>
              <tr className="border-b border-gray-800">
                {['Service', 'Shipments', 'DIM-Flagged', 'Unexpected', 'Review', 'Total Actual', 'Total Gap'].map((col) => (
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
              {skuData.map((sku, idx) => {
                const dimRate = ((sku.dimFlagged / sku.count) * 100).toFixed(1);
                return (
                  <tr
                    key={sku.service}
                    className={[
                      'border-b border-gray-800/60 transition-colors duration-75',
                      idx % 2 === 0 ? 'bg-transparent' : 'bg-gray-800/20',
                      'hover:bg-gray-800/50',
                    ].join(' ')}
                  >
                    <td className="px-4 py-3 font-medium text-gray-100 whitespace-nowrap">
                      {sku.service}
                    </td>
                    <td className="px-4 py-3 text-gray-400 tabular-nums whitespace-nowrap">
                      {sku.count.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`tabular-nums font-medium ${parseFloat(dimRate) > 50 ? 'text-rose-400' : parseFloat(dimRate) > 25 ? 'text-amber-400' : 'text-blue-400'}`}>
                        {sku.dimFlagged.toLocaleString()}
                        <span className="text-gray-600 font-normal ml-1">({dimRate}%)</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                      {sku.unexpected > 0 ? (
                        <span className="text-rose-400 font-medium">{sku.unexpected}</span>
                      ) : (
                        <span className="text-gray-600">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                      {sku.review > 0 ? (
                        <span className="text-amber-400 font-medium">{sku.review}</span>
                      ) : (
                        <span className="text-gray-600">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-300 tabular-nums whitespace-nowrap">
                      {formatDollars(sku.actualTotal)}
                    </td>
                    <td className={`px-4 py-3 tabular-nums font-medium whitespace-nowrap ${sku.gapTotal > 0 ? 'text-rose-400' : sku.gapTotal < 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                      {sku.gapTotal >= 0 ? '+' : ''}{formatDollars(sku.gapTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
