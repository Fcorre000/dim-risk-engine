import { useState, useMemo } from 'react';
import type { UploadState } from '../types/api';
import { computeGranularTrendsData, type TrendsGranularity } from '../lib/metrics';
import TrendsChart from '../components/charts/TrendsChart';

interface TrendsPageProps {
  uploadState: UploadState;
}

export default function TrendsPage({ uploadState }: TrendsPageProps) {
  const [granularity, setGranularity] = useState<TrendsGranularity>('day');
  const results = uploadState.results ?? [];
  const trendsData = useMemo(
    () => computeGranularTrendsData(results, granularity),
    [results, granularity],
  );

  const totalDisputes = trendsData[trendsData.length - 1]?.cumulativeDisputes ?? 0;
  const periodLabel = granularity === 'day' ? 'Daily' : 'Weekly';

  if (results.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Trends</h1>
          <p className="text-gray-500 text-sm mt-1">Charge trends and dispute candidate history</p>
        </div>
        <div className="rounded-xl bg-gray-900 border border-gray-800 px-6 py-16 flex items-center justify-center">
          <p className="text-sm text-gray-500">Upload an invoice on the Overview page to see trends</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Trends</h1>
          <p className="text-gray-500 text-sm mt-1">
            {periodLabel} charge trends across {results.length.toLocaleString()} shipments
            {totalDisputes > 0 && (
              <span className="ml-2 text-rose-400 font-medium">
                {totalDisputes} total dispute candidates
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="granularity-toggle" className="text-xs text-gray-500">
            Group by:
          </label>
          <select
            id="granularity-toggle"
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as TrendsGranularity)}
            className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-3 py-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-gray-900"
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
          </select>
        </div>
      </div>
      <TrendsChart data={trendsData} />
    </div>
  );
}
