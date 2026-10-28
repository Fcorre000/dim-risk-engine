import { useMemo } from 'react';
import type { PageId, UploadState } from '../types/api';
import { computeZoneDetails, formatDollars, zoneName } from '../lib/metrics';
import ZoneChart from '../components/charts/ZoneChart';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';

interface ByZonePageProps {
  uploadState: UploadState;
  onNavigate: (page: PageId) => void;
}

export default function ByZonePage({ uploadState, onNavigate }: ByZonePageProps) {
  const results = useMemo(() => uploadState.results ?? [], [uploadState.results]);
  const zoneDetails = useMemo(() => computeZoneDetails(results), [results]);

  if (results.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Zones" sub="DIM rate and billing gap for each FedEx pricing zone." />
        <section className="card">
          <EmptyState onGoToOverview={() => onNavigate('overview')}>
            No invoice scored yet. Zone totals appear here once one is.
          </EmptyState>
        </section>
      </div>
    );
  }

  const totalGap = zoneDetails.reduce((sum, z) => sum + z.gapTotal, 0);
  const worst = zoneDetails[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Zones"
        sub={
          <span className="tnum">
            {zoneDetails.length} zones · billed {totalGap >= 0 ? '+' : ''}{formatDollars(totalGap)} against the model's
            point predictions
            {worst && worst.gapTotal > 0 && <>, most of it in {zoneName(worst.zone)}</>}.
          </span>
        }
      />

      <section className="card card-pad" aria-label="Gap by zone">
        <div className="card-head mb-4">
          <div>
            <h2 className="card-title">Billed over the model, by zone</h2>
            <p className="meta mt-0.5">Actual minus predicted, summed per zone. Hover a row to fill its bar.</p>
          </div>
        </div>
        <ZoneChart data={zoneDetails} />
      </section>

      <section className="card overflow-hidden" aria-label="Zone summary">
        <div className="px-[22px] pb-3 pt-[22px]">
          <h2 className="card-title">Zone summary</h2>
          <p className="meta mt-0.5">Largest gap first</p>
        </div>
        <div className="overflow-x-auto">
          <table className="table" aria-label="Zone cost summary table">
            <thead>
              <tr>
                <th scope="col">Zone</th>
                <th scope="col" className="num">Shipments</th>
                <th scope="col" className="num">DIM rate</th>
                <th scope="col" className="num">High priority</th>
                <th scope="col" className="num">Billed</th>
                <th scope="col" className="num">Predicted</th>
                <th scope="col" className="num">Gap</th>
              </tr>
            </thead>
            <tbody>
              {zoneDetails.map((zone) => (
                <tr key={zone.zone}>
                  <td style={{ color: 'var(--ink)' }}>{zoneName(zone.zone)}</td>
                  <td className="num" style={{ color: 'var(--muted)' }}>{zone.count.toLocaleString()}</td>
                  <td className="num">{zone.dimRate.toFixed(1)}%</td>
                  <td className="num" style={{ color: zone.highPriority > 0 ? 'var(--over)' : 'var(--muted)' }}>
                    {zone.highPriority.toLocaleString()}
                  </td>
                  <td className="num">{formatDollars(zone.actualTotal)}</td>
                  <td className="num" style={{ color: 'var(--muted)' }}>{formatDollars(zone.predictedTotal)}</td>
                  <td className="num" style={{ color: zone.gapTotal > 0 ? 'var(--over)' : 'var(--ink)' }}>
                    {zone.gapTotal >= 0 ? '+' : ''}{formatDollars(zone.gapTotal)}
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
