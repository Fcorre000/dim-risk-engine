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

  if (results.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-[11px] tracking-[0.18em] uppercase font-medium" style={{ color: 'var(--muted)' }}>
          &gt; 04 TRENDS · CHARGE × DISPUTE / PERIOD
        </h1>
        <section className="border" style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}>
          <div className="p-10 text-center text-[11px] tracking-widest" style={{ color: 'var(--muted)' }}>
            NO SIGNAL — INGEST AN INVOICE ON 00 OVERVIEW
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page title + granularity toggle */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[11px] tracking-[0.18em] uppercase font-medium" style={{ color: 'var(--muted)' }}>
            &gt; 04 TRENDS · CHARGE × DISPUTE / PERIOD
          </h1>
          <p className="text-[10px] tracking-widest uppercase mt-1" style={{ color: 'var(--muted)' }}>
            N.SHIPMENTS {results.length.toLocaleString()} · GRAIN {granularity.toUpperCase()}
            {totalDisputes > 0 && (
              <span className="ml-2" style={{ color: 'var(--crit)' }}>
                · DISPUTES {totalDisputes}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 text-[10px] tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
          <label htmlFor="granularity-toggle">GROUP.BY</label>
          <select
            id="granularity-toggle"
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as TrendsGranularity)}
            className="border px-2 py-1 text-[10px] tracking-widest uppercase cursor-pointer"
            style={{ background: 'var(--panel)', borderColor: 'var(--border-2)', color: 'var(--text)' }}
          >
            <option value="day">DAY</option>
            <option value="week">WEEK</option>
          </select>
        </div>
      </div>

      <TrendsChart data={trendsData} />
    </div>
  );
}
