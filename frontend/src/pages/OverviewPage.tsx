import { useMemo, useState } from 'react';
import type { PageId, UploadState } from '../types/api';
import {
  computeKpis,
  computePeriodSeries,
  computeRecoverableByZone,
  computeSignalCounts,
  formatDollars,
  pickGranularity,
  zoneName,
  type TrendsGranularity,
} from '../lib/metrics';
import UploadZone, { StreamProgress } from '../components/upload/UploadZone';
import PageHeader from '../components/ui/PageHeader';
import PeriodChart, { BarSwatch } from '../components/charts/PeriodChart';
import ZoneRing from '../components/charts/ZoneRing';
import ActualVsPredictedChart from '../components/charts/ActualVsPredictedChart';
import AnomalyTable from '../components/table/AnomalyTable';
import Icon from '../components/ui/Icon';

interface OverviewPageProps {
  uploadState: UploadState;
  onUpload: (file: File) => Promise<void>;
  onDemoLoad: () => Promise<void>;
  onNavigate: (page: PageId) => void;
}

const GRAIN_NAME: Record<TrendsGranularity, string> = { day: 'day', week: 'week', month: 'month' };

function pct(part: number, whole: number, digits = 0): string {
  if (whole <= 0) return '0%';
  return `${((part / whole) * 100).toFixed(digits)}%`;
}

function dateRange(results: UploadState['results']): string | null {
  let min: string | null = null;
  let max: string | null = null;
  for (const r of results ?? []) {
    if (!r.shipment_date) continue;
    if (!min || r.shipment_date < min) min = r.shipment_date;
    if (!max || r.shipment_date > max) max = r.shipment_date;
  }
  if (!min || !max) return null;
  const fmt = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** First run: the drop target where the dashboard will be, beside what gets checked. */
function FirstRun(props: Pick<OverviewPageProps, 'uploadState' | 'onUpload' | 'onDemoLoad'>) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <UploadZone {...props} variant="full" />
      <section className="card card-pad">
        <h2 className="card-title">What each shipment is checked for</h2>
        <ol className="mt-5 space-y-5">
          {[
            ['DIM weight', 'A calibrated classifier decides whether the parcel should have been billed at dimensional weight, and compares that with FedEx’s call.'],
            ['Charge', 'A conformal regressor predicts the net charge with a 95% interval. A bill above the ceiling is money to claim back.'],
            ['Profile', 'An anomaly model scores how unusual the shipment is against two years of invoices.'],
          ].map(([t, d]) => (
            <li key={t}>
              <p style={{ color: 'var(--ink)' }}>{t}</p>
              <p className="mt-1 text-[14px]" style={{ color: 'var(--muted)' }}>{d}</p>
            </li>
          ))}
        </ol>
        <p className="meta mt-6">Two or more checks firing marks a shipment high priority; one marks it medium.</p>
      </section>
    </div>
  );
}

function Total({
  label,
  value,
  size,
  pill,
  note,
}: {
  label: string;
  value: string;
  size: 'lead' | 'sub';
  pill?: { text: string; tone: 'over' | 'ok' | 'neutral' };
  note?: string;
}) {
  return (
    <div>
      <p className="text-[14px]" style={{ color: 'var(--muted)' }}>{label}</p>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className={`figure ${size === 'lead' ? 'text-[40px] leading-[48px]' : 'text-[28px] leading-9'}`}>{value}</p>
        {pill && <span className={`pill pill-${pill.tone}`}>{pill.text}</span>}
      </div>
      {note && <p className="meta mt-1.5">{note}</p>}
    </div>
  );
}

export default function OverviewPage({ uploadState, onUpload, onDemoLoad, onNavigate }: OverviewPageProps) {
  const results = useMemo(() => uploadState.results ?? [], [uploadState.results]);
  const computedKpis = useMemo(() => computeKpis(results), [results]);
  const signals = useMemo(() => computeSignalCounts(results), [results]);
  const zoneShares = useMemo(() => computeRecoverableByZone(results), [results]);
  const totals = useMemo(() => {
    let billed = 0;
    let predicted = 0;
    for (const r of results) { billed += r.actual_net_charge; predicted += r.charge_predicted; }
    return { billed, predicted };
  }, [results]);

  const autoGrain = useMemo(() => pickGranularity(results), [results]);
  const [grainChoice, setGrainChoice] = useState<TrendsGranularity | null>(null);
  const grain = grainChoice ?? autoGrain;
  const series = useMemo(() => computePeriodSeries(results, grain), [results, grain]);

  const sk = uploadState.streamingKpis;
  const shipmentCount = uploadState.shipmentCount ?? 0;
  const kpis = sk
    ? {
        totalShipments: shipmentCount,
        dimFlaggedCount: sk.dimFlaggedCount,
        disputeCandidates: sk.disputeCandidates,
        estRecoverable: sk.estRecoverable,
        billed: sk.billedTotal,
        predicted: sk.predictedTotal,
      }
    : { ...computedKpis, billed: totals.billed, predicted: totals.predicted };

  const hasData = results.length > 0 || shipmentCount > 0;
  const streaming = uploadState.status === 'uploading';

  const leadZone = zoneShares[0];
  const finding = !hasData
    ? 'Score a FedEx invoice for DIM-weight overcharges and bills the model can’t explain.'
    : streaming
    ? 'Scoring shipments as they stream in. Totals update live.'
    : kpis.estRecoverable <= 0
    ? 'Nothing on this invoice was billed above the model’s 95% ceiling.'
    : leadZone
    ? `${zoneName(leadZone.zone)} holds ${pct(leadZone.recoverable, kpis.estRecoverable)} of the ${formatDollars(kpis.estRecoverable)} billed above the model’s ceiling.`
    : `${formatDollars(kpis.estRecoverable)} was billed above the model’s ceiling.`;

  const range = dateRange(results);
  const gapVsModel = kpis.predicted > 0 ? (kpis.billed - kpis.predicted) / kpis.predicted : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoice audit"
        sub={
          <>
            {finding}
            {hasData && uploadState.filename && (
              <span className="meta tnum mt-1 block">
                {uploadState.filename} · {shipmentCount.toLocaleString()} shipments
                {range && ` · ${range}`}
                {uploadState.analysisTimeMs != null && ` · scored in ${formatMs(uploadState.analysisTimeMs)}`}
              </span>
            )}
          </>
        }
        actions={
          hasData ? <UploadZone uploadState={uploadState} onUpload={onUpload} onDemoLoad={onDemoLoad} variant="compact" /> : undefined
        }
      />

      {hasData && streaming && (
        <div className="card px-[22px] py-4">
          <StreamProgress uploadState={uploadState} />
        </div>
      )}

      {hasData && uploadState.status === 'error' && uploadState.errorMessage && (
        <p role="alert" className="card px-[22px] py-4 text-[14px]" style={{ color: 'var(--over)' }}>
          Couldn't finish {uploadState.filename ?? 'that file'}: {uploadState.errorMessage}
        </p>
      )}

      {!hasData ? (
        <FirstRun uploadState={uploadState} onUpload={onUpload} onDemoLoad={onDemoLoad} />
      ) : (
        <>
          {/* Hero: billed per period with the recoverable slice, and the totals beside it */}
          <section className="card card-pad grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]" aria-label="Billed and recoverable">
            <div className="min-w-0">
              <div className="card-head mb-5">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <h2 className="card-title">Billed by {GRAIN_NAME[grain]}</h2>
                  <span className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--muted)' }}>
                    <BarSwatch cap="top" /> Billed by FedEx
                  </span>
                  <span className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--muted)' }}>
                    <BarSwatch cap="bottom" /> Over the model's ceiling
                  </span>
                </div>
                <div className="seg" role="group" aria-label="Group by">
                  {(['day', 'week', 'month'] as const).map((g) => (
                    <button key={g} type="button" aria-pressed={grain === g} onClick={() => setGrainChoice(g)}>
                      {g === 'day' ? 'Daily' : g === 'week' ? 'Weekly' : 'Monthly'}
                    </button>
                  ))}
                </div>
              </div>
              <PeriodChart points={series} granularity={grain} />
            </div>

            <aside
              className="flex flex-col justify-between gap-7 xl:border-l xl:pl-8"
              style={{ borderColor: 'var(--line)' }}
              aria-label="Invoice totals"
            >
              <Total
                label="Recoverable"
                size="lead"
                value={formatDollars(kpis.estRecoverable)}
                pill={kpis.billed > 0 && kpis.estRecoverable > 0 ? { text: `${pct(kpis.estRecoverable, kpis.billed, 1)} of billed`, tone: 'over' } : undefined}
                note={streaming ? 'Running total — final when the file finishes' : 'Billed above the 95% ceiling on flagged shipments'}
              />
              <Total
                label="Billed by FedEx"
                size="sub"
                value={formatDollars(kpis.billed)}
                pill={
                  kpis.predicted > 0
                    ? {
                        text: `${gapVsModel >= 0 ? '+' : ''}${(gapVsModel * 100).toFixed(1)}% vs model`,
                        tone: gapVsModel > 0.005 ? 'over' : 'neutral',
                      }
                    : undefined
                }
                note={`Model's estimate ${formatDollars(kpis.predicted)}`}
              />
              <Total
                label="Billed at DIM weight (model)"
                size="sub"
                value={kpis.dimFlaggedCount.toLocaleString()}
                pill={{ text: `${pct(kpis.dimFlaggedCount, kpis.totalShipments)} of shipments`, tone: 'neutral' }}
                note="Calibrated probability above 50%"
              />
            </aside>
          </section>

          {/* Three answers to "what next": the queue, why, and where */}
          <div className="grid gap-4 lg:grid-cols-3">
            <section className="card card-pad flex flex-col" aria-label="Review queue">
              <div className="card-head">
                <h2 className="card-title">Review queue</h2>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNavigate('anomalies')}>
                  Open queue <Icon name="arrowRight" size={14} />
                </button>
              </div>
              <p className="mt-6 flex items-baseline gap-2">
                <span className="figure text-[40px] leading-[48px]">{signals.flagged.toLocaleString()}</span>
                <span className="tnum" style={{ color: 'var(--faint)' }}>of {results.length.toLocaleString()} to review</span>
              </p>
              <div className="mt-5 flex h-2.5 w-full gap-[3px]" role="img"
                aria-label={`${signals.high} high, ${signals.medium} medium, ${signals.clear} clear`}>
                {[
                  { n: signals.high, c: 'var(--over)' },
                  { n: signals.medium, c: 'var(--warn)' },
                  { n: signals.clear, c: 'var(--line-strong)' },
                ].filter((s) => s.n > 0).map((s, i) => (
                  <span key={i} className="h-full rounded-full" style={{ flexGrow: s.n, flexBasis: 0, background: s.c }} />
                ))}
              </div>
              <dl className="mt-5 grid grid-cols-3 gap-3">
                {[
                  { k: 'High', n: signals.high, c: 'var(--over)' },
                  { k: 'Medium', n: signals.medium, c: 'var(--warn)' },
                  { k: 'Clear', n: signals.clear, c: 'var(--line-strong)' },
                ].map((s) => (
                  <div key={s.k}>
                    <dt className="flex items-center gap-2 text-[14px]" style={{ color: 'var(--muted)' }}>
                      <span className="dot" style={{ background: s.c }} />{s.k}
                    </dt>
                    <dd className="figure mt-2 text-[24px] leading-8">{s.n.toLocaleString()}</dd>
                    <dd className="meta tnum">{pct(s.n, results.length)}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="card card-pad" aria-label="Which checks fired">
              <h2 className="card-title">Which checks fired</h2>
              <p className="meta mt-0.5">On the {signals.flagged.toLocaleString()} flagged shipments; one can trip several.</p>
              <ul className="mt-6 space-y-5">
                {[
                  { label: 'Bill above the 95% ceiling', n: signals.outsideInterval },
                  { label: 'Unusual shipment profile', n: signals.anomaly },
                  { label: 'DIM call disagrees with FedEx', n: signals.dimDisagrees },
                ]
                  .sort((a, b) => b.n - a.n)
                  .map((s, i) => (
                    <li key={s.label}>
                      <div className="flex items-baseline justify-between gap-3 text-[14px]">
                        <span style={{ color: 'var(--ink)' }}>{s.label}</span>
                        <span className="tnum" style={{ color: 'var(--ink)' }}>
                          {s.n.toLocaleString()}{' '}
                          <span style={{ color: 'var(--faint)' }}>{pct(s.n, signals.flagged)}</span>
                        </span>
                      </div>
                      <div className="mt-2 h-1 w-full rounded-full" style={{ background: 'var(--raised)' }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: signals.flagged > 0 ? `${(s.n / signals.flagged) * 100}%` : 0,
                            background: i === 0 ? 'var(--ink)' : 'var(--faint)',
                          }}
                        />
                      </div>
                    </li>
                  ))}
              </ul>
            </section>

            <section className="card card-pad" aria-label="Recoverable by zone">
              <h2 className="card-title">Where the money is</h2>
              <p className="meta mt-0.5">Recoverable dollars by pricing zone</p>
              <div className="mt-5">
                <ZoneRing data={zoneShares} />
              </div>
            </section>
          </div>

          <div className="grid gap-4 xl:grid-cols-12">
            <div className="min-w-0 xl:col-span-5">
              <ActualVsPredictedChart data={results} />
            </div>
            <div className="min-w-0 xl:col-span-7">
              <AnomalyTable results={results} pageSize={7} onViewAll={() => onNavigate('anomalies')} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
