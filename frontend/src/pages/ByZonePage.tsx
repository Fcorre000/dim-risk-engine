import type { UploadState } from '../types/api';
import { computeZoneDetails, formatDollars } from '../lib/metrics';
import ZoneChart from '../components/charts/ZoneChart';

interface ByZonePageProps {
  uploadState: UploadState;
}

export default function ByZonePage({ uploadState }: ByZonePageProps) {
  const results = uploadState.results ?? [];
  const zoneDetails = computeZoneDetails(results);

  if (results.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-[11px] tracking-[0.18em] uppercase font-medium" style={{ color: 'var(--muted)' }}>
          &gt; 02 BY.ZONE · DIM.RATE × COST.GAP
        </h1>
        <section className="border" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
          <div className="p-10 text-center text-[11px] tracking-widest" style={{ color: 'var(--muted)' }}>
            NO SIGNAL — INGEST AN INVOICE ON 00 OVERVIEW
          </div>
        </section>
      </div>
    );
  }

  const totalGap = zoneDetails.reduce((sum, z) => sum + z.gapTotal, 0);

  return (
    <div className="space-y-4">
      {/* Page title */}
      <div className="flex items-baseline justify-between">
        <h1 className="text-[11px] tracking-[0.18em] uppercase font-medium" style={{ color: 'var(--muted)' }}>
          &gt; 02 BY.ZONE · DIM.RATE × COST.GAP
        </h1>
        <p className="text-[10px] tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
          N.ZONES {zoneDetails.length}
          {totalGap > 0 && (
            <span className="ml-2" style={{ color: 'var(--crit)' }}>
              · GAP.TOTAL +{formatDollars(totalGap)}
            </span>
          )}
        </p>
      </div>

      {/* Polar radar */}
      <ZoneChart data={zoneDetails} />

      {/* Zone summary table */}
      <section className="border" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
        <div
          className="px-4 py-2 border-b flex items-center justify-between text-[10px] tracking-widest"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          <span>&gt; TBL.02 · ZONE_SUMMARY</span>
          <span>ORDER.BY gap.total DESC</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px] font-jb" role="table" aria-label="Zone cost summary table">
            <thead>
              <tr className="border-b text-[9px] tracking-widest" style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}>
                <th scope="col" className="px-4 py-2 text-left">ZONE</th>
                <th scope="col" className="px-4 py-2 text-right">N</th>
                <th scope="col" className="px-4 py-2 text-right">DIM.RATE</th>
                <th scope="col" className="px-4 py-2 text-right">UNEXPECTED</th>
                <th scope="col" className="px-4 py-2 text-right">ACT.SUM</th>
                <th scope="col" className="px-4 py-2 text-right">PRED.SUM</th>
                <th scope="col" className="px-4 py-2 text-right">GAP.TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {zoneDetails.map((zone) => (
                <tr
                  key={zone.zone}
                  className="border-b transition-colors duration-150"
                  style={{ borderColor: 'var(--border)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--row-hov)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <td className="px-4 py-1.5 tabular-nums" style={{ color: 'var(--text)' }}>
                    Z.{zone.zone}
                  </td>
                  <td className="px-4 py-1.5 tabular-nums text-right" style={{ color: 'var(--muted)' }}>
                    {zone.count.toLocaleString()}
                  </td>
                  <td
                    className="px-4 py-1.5 tabular-nums text-right"
                    style={{
                      color: zone.dimRate > 50 ? 'var(--crit)' : zone.dimRate > 25 ? 'var(--warn)' : 'var(--accent)',
                      textShadow: zone.dimRate > 25 ? 'none' : 'var(--glow)',
                    }}
                  >
                    {zone.dimRate}%
                  </td>
                  <td
                    className="px-4 py-1.5 tabular-nums text-right"
                    style={{ color: zone.unexpected > 0 ? 'var(--crit)' : 'var(--muted)' }}
                  >
                    {zone.unexpected}
                  </td>
                  <td className="px-4 py-1.5 tabular-nums text-right">
                    {formatDollars(zone.actualTotal)}
                  </td>
                  <td className="px-4 py-1.5 tabular-nums text-right" style={{ color: 'var(--muted)' }}>
                    {formatDollars(zone.predictedTotal)}
                  </td>
                  <td
                    className="px-4 py-1.5 tabular-nums text-right"
                    style={{ color: zone.gapTotal > 0 ? 'var(--crit)' : zone.gapTotal < 0 ? 'var(--accent)' : 'var(--muted)' }}
                  >
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
