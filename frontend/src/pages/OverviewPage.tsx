import { useMemo } from 'react';
import type { UploadState } from '../types/api';
import { computeKpis, computeZoneDetails, formatDollars } from '../lib/metrics';
import UploadZone from '../components/upload/UploadZone';
import UploadStatusCard from '../components/upload/UploadStatusCard';
import KpiCard from '../components/kpi/KpiCard';
import ZoneChart from '../components/charts/ZoneChart';
import ActualVsPredictedChart from '../components/charts/ActualVsPredictedChart';
import AnomalyTable from '../components/table/AnomalyTable';

interface OverviewPageProps {
  uploadState: UploadState;
  onUpload: (file: File) => Promise<void>;
  onDemoLoad: () => Promise<void>;
}

function fmt$short(n: number): string {
  if (n >= 1000) return '$' + Math.round(n).toLocaleString('en-US');
  return formatDollars(n);
}

export default function OverviewPage({ uploadState, onUpload, onDemoLoad }: OverviewPageProps) {
  const results = uploadState.results ?? [];
  const computedKpis = useMemo(() => computeKpis(results), [results]);
  const zoneDetails = useMemo(() => computeZoneDetails(results), [results]);

  const sk = uploadState.streamingKpis;
  const shipmentCount = uploadState.shipmentCount ?? 0;
  const kpis = sk
    ? {
        totalShipments: shipmentCount,
        dimFlaggedCount: sk.dimFlaggedCount,
        dimFlaggedPercent:
          shipmentCount > 0 ? parseFloat(((sk.dimFlaggedCount / shipmentCount) * 100).toFixed(1)) : 0,
        disputeCandidates: sk.disputeCandidates,
        estRecoverable: sk.estRecoverable,
      }
    : computedKpis;

  const hasData = results.length > 0 || shipmentCount > 0;

  return (
    <div className="space-y-4">
      {/* Page title */}
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-[11px] tracking-[0.18em] uppercase font-medium" style={{ color: 'var(--muted)' }}>
            &gt; 00 OVERVIEW · OP.DIM.RECONCILE
          </h1>
        </div>
      </div>

      {/* Ingest source + result */}
      <UploadZone uploadState={uploadState} onUpload={onUpload} onDemoLoad={onDemoLoad} />
      <UploadStatusCard uploadState={uploadState} />

      {/* KPI strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          title="N.SHIPMENTS"
          value={hasData ? kpis.totalShipments.toLocaleString() : '—'}
          subtitle={hasData ? 'INGESTED' : 'AWAIT.INGEST'}
          accent="default"
          registerIndex={0}
        />
        <KpiCard
          title="DIM.FLAGGED"
          value={hasData ? kpis.dimFlaggedCount.toLocaleString() : '—'}
          subtitle={hasData ? `${kpis.dimFlaggedPercent}% OF N` : 'AWAIT.INGEST'}
          accent={hasData && kpis.dimFlaggedPercent > 0 ? 'warn' : 'default'}
          registerIndex={1}
        />
        <KpiCard
          title="DISPUTE.Q"
          value={hasData ? kpis.disputeCandidates.toLocaleString() : '—'}
          subtitle={hasData ? 'CLS DISAGREES' : 'AWAIT.INGEST'}
          accent={hasData && kpis.disputeCandidates > 0 ? 'crit' : 'default'}
          registerIndex={2}
        />
        <KpiCard
          title="RECOVER.USD"
          value={hasData ? fmt$short(kpis.estRecoverable) : '—'}
          subtitle={
            uploadState.status === 'uploading'
              ? 'STREAM · FINAL ON COMPLETE'
              : hasData
              ? 'ACT − PRED.HIGH'
              : 'AWAIT.INGEST'
          }
          accent={hasData && kpis.estRecoverable > 0 ? 'accent' : 'default'}
          registerIndex={3}
        />
      </section>

      {/* Charts row — 7/5 split per spec */}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-7 min-w-0">
          <ZoneChart data={zoneDetails} />
        </div>
        <div className="col-span-12 lg:col-span-5 min-w-0">
          <ActualVsPredictedChart data={results} />
        </div>
      </div>

      {/* Peek table */}
      <AnomalyTable results={results} pageSize={7} title="> TBL.01 · DISPUTE_QUEUE.PEEK" />
    </div>
  );
}
