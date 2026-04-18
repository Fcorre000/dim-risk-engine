import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { TrendsDataPoint } from '../../lib/metrics';
import { formatDollars } from '../../lib/metrics';

interface TrendsChartProps {
  data: TrendsDataPoint[];
}

interface ChargeTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function TooltipShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="border px-3 py-2 text-[11px] shadow-none font-jb"
      style={{
        background: 'var(--panel)',
        borderColor: 'var(--border-2)',
        color: 'var(--text)',
      }}
    >
      {children}
    </div>
  );
}

function ChargeTooltip({ active, payload, label }: ChargeTooltipProps) {
  if (!active || !payload?.length) return null;
  const actual = payload.find((p) => p.name === 'FedEx Billed')?.value ?? 0;
  const predicted = payload.find((p) => p.name === 'Model Predicted')?.value ?? 0;
  const gap = actual - predicted;
  return (
    <TooltipShell>
      <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>{label}</p>
      <p style={{ color: 'var(--accent)', textShadow: 'var(--glow)' }}>BILLED {formatDollars(actual)}</p>
      <p style={{ color: 'var(--muted)' }}>PRED {formatDollars(predicted)}</p>
      {gap !== 0 && (
        <p className="mt-1 font-medium" style={{ color: gap > 0 ? 'var(--crit)' : 'var(--muted)' }}>
          GAP {gap >= 0 ? '+' : '-'}{formatDollars(Math.abs(gap))}
        </p>
      )}
    </TooltipShell>
  );
}

interface DisputeTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
  label?: string;
}

function DisputeTooltip({ active, payload, label }: DisputeTooltipProps) {
  if (!active || !payload?.length) return null;
  const monthly = payload.find((p) => p.name === 'New')?.value ?? 0;
  const cumulative = payload.find((p) => p.name === 'Cumulative')?.value ?? 0;
  return (
    <TooltipShell>
      <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>{label}</p>
      <p style={{ color: 'var(--crit)' }}>NEW {monthly}</p>
      <p style={{ color: 'var(--warn)' }}>CUM {cumulative}</p>
    </TooltipShell>
  );
}

function TrendsPanel({
  title,
  headerRight,
  children,
}: {
  title: string;
  headerRight?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="border p-4"
      style={{ borderColor: 'var(--border)', background: 'var(--panel)' }}
    >
      <div
        className="flex items-center justify-between text-[10px] tracking-widest mb-3"
        style={{ color: 'var(--muted)' }}
      >
        <span>{title}</span>
        {headerRight && <span>{headerRight}</span>}
      </div>
      {children}
    </section>
  );
}

export default function TrendsChart({ data }: TrendsChartProps) {
  const hasData = data.some((d) => d.actual > 0 || d.predicted > 0);
  const densePoints = data.length > 10;
  const minWidth = Math.max(600, data.length * 28);

  return (
    <div className="space-y-4">
      <TrendsPanel title="> FIG.03 · BILLED × PREDICTED / PERIOD" headerRight={`N=${data.length}`}>
        {!hasData ? (
          <div className="h-[280px] flex items-center justify-center text-[11px] tracking-widest" style={{ color: 'var(--muted)' }}>
            NO SIGNAL — INGEST AN INVOICE
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth }}>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data} margin={{ top: 8, right: 16, bottom: densePoints ? 40 : 0, left: 16 }}>
                  <CartesianGrid strokeDasharray="0" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: 'var(--muted)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={false}
                    angle={densePoints ? -45 : 0}
                    textAnchor={densePoints ? 'end' : 'middle'}
                    height={densePoints ? 60 : 30}
                  />
                  <YAxis
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    tick={{ fill: 'var(--muted)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChargeTooltip />} cursor={{ stroke: 'var(--border-2)' }} />
                  <Legend
                    wrapperStyle={{ fontSize: '10px', color: 'var(--muted)', paddingTop: '8px', letterSpacing: '0.1em', textTransform: 'uppercase' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="FedEx Billed"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    dot={{ fill: 'var(--accent)', r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    name="Model Predicted"
                    stroke="var(--muted)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={{ fill: 'var(--muted)', r: 2.5, strokeWidth: 0 }}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </TrendsPanel>

      <TrendsPanel title="> FIG.04 · DISPUTE.COUNT / PERIOD" headerRight={`N=${data.length}`}>
        {!hasData ? (
          <div className="h-[280px] flex items-center justify-center text-[11px] tracking-widest" style={{ color: 'var(--muted)' }}>
            NO SIGNAL — INGEST AN INVOICE
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth }}>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data} margin={{ top: 8, right: 16, bottom: densePoints ? 40 : 0, left: 16 }}>
                  <CartesianGrid strokeDasharray="0" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: 'var(--muted)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={false}
                    angle={densePoints ? -45 : 0}
                    textAnchor={densePoints ? 'end' : 'middle'}
                    height={densePoints ? 60 : 30}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: 'var(--muted)', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<DisputeTooltip />} cursor={{ stroke: 'var(--border-2)' }} />
                  <Legend
                    wrapperStyle={{ fontSize: '10px', color: 'var(--muted)', paddingTop: '8px', letterSpacing: '0.1em', textTransform: 'uppercase' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="disputeCount"
                    name="New"
                    stroke="var(--crit)"
                    strokeWidth={2}
                    dot={{ fill: 'var(--crit)', r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulativeDisputes"
                    name="Cumulative"
                    stroke="var(--warn)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={{ fill: 'var(--warn)', r: 2.5, strokeWidth: 0 }}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </TrendsPanel>
    </div>
  );
}
