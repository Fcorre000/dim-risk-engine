import type { UploadState } from '../types/api';
import { computeKpis, computeZoneData, computeMonthlyData, formatDollars } from '../lib/metrics';
import UploadZone from '../components/upload/UploadZone';
import UploadStatusCard from '../components/upload/UploadStatusCard';
import KpiCard from '../components/kpi/KpiCard';
import ZoneChart from '../components/charts/ZoneChart';
import ActualVsPredictedChart from '../components/charts/ActualVsPredictedChart';
import AnomalyTable from '../components/table/AnomalyTable';

interface OverviewPageProps {
  uploadState: UploadState;
  onUpload: (file: File) => Promise<void>;
}

export default function OverviewPage({ uploadState, onUpload }: OverviewPageProps) {
  const results = uploadState.results ?? [];
  const kpis = computeKpis(results);
  const zoneData = computeZoneData(results);
  const monthlyData = computeMonthlyData(results);
  const hasData = results.length > 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-100">Overview</h1>
        <p className="text-gray-500 text-sm mt-1">
          Upload a FedEx invoice to analyze DIM billing anomalies
        </p>
      </div>

      <UploadZone uploadState={uploadState} onUpload={onUpload} />

      <UploadStatusCard uploadState={uploadState} />

      {/* KPI cards — 4 columns on lg, 2 on sm, 1 on mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Shipments"
          value={hasData ? kpis.totalShipments.toLocaleString() : '—'}
          subtitle={hasData ? 'from uploaded invoice' : 'Upload an invoice'}
        />
        <KpiCard
          title="DIM-Flagged"
          value={hasData ? kpis.dimFlaggedCount.toLocaleString() : '—'}
          subtitle={hasData ? `${kpis.dimFlaggedPercent}% of shipments` : 'Upload an invoice'}
          accent={hasData && kpis.dimFlaggedPercent > 30 ? 'amber' : 'default'}
        />
        <KpiCard
          title="Dispute Candidates"
          value={hasData ? kpis.disputeCandidates.toLocaleString() : '—'}
          subtitle={hasData ? 'DIM anomaly: Unexpected' : 'Upload an invoice'}
          accent={hasData && kpis.disputeCandidates > 0 ? 'rose' : 'default'}
        />
        <KpiCard
          title="Recoverable"
          value={hasData ? formatDollars(kpis.estRecoverable) : '—'}
          subtitle={hasData ? 'actual − predicted for Unexpected rows' : 'Upload an invoice'}
          accent={hasData && kpis.estRecoverable > 0 ? 'emerald' : 'default'}
        />
      </div>

      {/* Charts row — 2 columns on lg, stacked on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ZoneChart data={zoneData} />
        <ActualVsPredictedChart data={monthlyData} />
      </div>

      <AnomalyTable results={results} />
    </div>
  );
}
