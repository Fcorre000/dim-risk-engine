import type { UploadState } from '../types/api';
import { computeTrendsData } from '../lib/metrics';
import TrendsChart from '../components/charts/TrendsChart';

interface TrendsPageProps {
  uploadState: UploadState;
}

export default function TrendsPage({ uploadState }: TrendsPageProps) {
  const results = uploadState.results ?? [];
  const trendsData = computeTrendsData(results);

  const totalDisputes = trendsData[trendsData.length - 1]?.cumulativeDisputes ?? 0;

  if (results.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-100">Trends</h1>
          <p className="text-gray-500 text-sm mt-1">Month-over-month charge trends and dispute candidate history</p>
        </div>
        <div className="rounded-xl bg-gray-900 border border-gray-800 px-6 py-16 flex items-center justify-center">
          <p className="text-sm text-gray-500">Upload an invoice on the Overview page to see trends</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Trends</h1>
        <p className="text-gray-500 text-sm mt-1">
          Month-over-month charge trends across {results.length.toLocaleString()} shipments
          {totalDisputes > 0 && (
            <span className="ml-2 text-rose-400 font-medium">
              {totalDisputes} total dispute candidates
            </span>
          )}
        </p>
      </div>
      <TrendsChart data={trendsData} />
    </div>
  );
}
