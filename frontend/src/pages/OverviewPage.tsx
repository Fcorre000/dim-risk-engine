import type { UploadState } from '../types/api';
import { computeKpis, computeZoneData, formatDollars } from '../lib/metrics';
import UploadZone from '../components/upload/UploadZone';
import UploadStatusCard from '../components/upload/UploadStatusCard';
import KpiCard from '../components/kpi/KpiCard';
import ZoneChart from '../components/charts/ZoneChart';

interface OverviewPageProps {
  uploadState: UploadState;
  onUpload: (file: File) => Promise<void>;
}

export default function OverviewPage({ uploadState, onUpload }: OverviewPageProps) {
  const results = uploadState.results ?? [];
  const kpis = computeKpis(results);
  const zoneData = computeZoneData(results);
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

      {/* KPI cards — mobile-first responsive grid */}
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
          title="Est. Recoverable"
          value={hasData ? formatDollars(kpis.estRecoverable) : '—'}
          subtitle={hasData ? 'from Unexpected DIM rows' : 'Upload an invoice'}
          accent={hasData && kpis.estRecoverable > 0 ? 'emerald' : 'default'}
        />
      </div>

      <ZoneChart data={zoneData} />

      {/* Actual vs predicted chart slot — added in 02-05 */}
      {/* Anomaly table slot — added in 02-05 */}
    </div>
  );
}
