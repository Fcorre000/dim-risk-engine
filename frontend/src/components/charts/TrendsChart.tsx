import { useId, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { TrendsDataPoint } from '../../lib/metrics';
import { formatDollars, formatDollarsShort } from '../../lib/metrics';

interface TrendsChartProps {
  data: TrendsDataPoint[];
}

const AXIS_TICK = { fill: 'var(--faint)', fontSize: 12, fontFamily: 'Manrope, sans-serif' };

interface TipProps {
  active?: boolean;
  payload?: Array<{ payload: TrendsDataPoint }>;
  label?: string;
}

function TooltipShell({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="float min-w-[200px] p-4 text-[14px]">
      <p className="text-[13px]" style={{ color: 'var(--muted)' }}>{label}</p>
      <dl className="mt-3 space-y-2">{children}</dl>
    </div>
  );
}

function TipRow({ dot, name, value }: { dot?: string; name: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="flex items-center gap-2" style={{ color: 'var(--ink)' }}>
        {dot && <span className="dot" style={{ background: dot }} />}
        {name}
      </dt>
      <dd className="tnum" style={{ color: 'var(--ink)' }}>{value}</dd>
    </div>
  );
}

function ChargeTooltip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const gap = p.actual - p.predicted;
  return (
    <TooltipShell label={label}>
      <TipRow dot="var(--billed)" name="Billed" value={formatDollars(p.actual)} />
      <TipRow dot="var(--faint)" name="Model" value={formatDollars(p.predicted)} />
      <div className="flex items-center justify-between gap-4 pt-1">
        <dt style={{ color: 'var(--muted)' }}>Gap</dt>
        <dd className="tnum" style={{ color: gap > 0 ? 'var(--over)' : 'var(--ink)' }}>
          {gap >= 0 ? '+' : '-'}{formatDollars(Math.abs(gap))}
        </dd>
      </div>
    </TooltipShell>
  );
}

function DisputeTooltip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <TooltipShell label={label}>
      <TipRow dot="var(--over)" name="High priority" value={p.disputeCount.toLocaleString()} />
      <TipRow name="Running total" value={p.cumulativeDisputes.toLocaleString()} />
    </TooltipShell>
  );
}

function Panel({ title, meta, legend, children }: {
  title: string; meta: string; legend?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="card card-pad min-w-0">
      <div className="card-head">
        <div>
          <h2 className="card-title">{title}</h2>
          <p className="meta mt-0.5">{meta}</p>
        </div>
        {legend}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Show 4–8 flat labels whatever the period count; never rotate. */
function tickInterval(n: number): number {
  return n <= 8 ? 0 : Math.ceil(n / 7) - 1;
}

export default function TrendsChart({ data }: TrendsChartProps) {
  const patternId = `th${useId().replace(/:/g, '')}`;
  const [activeBar, setActiveBar] = useState<number | null>(null);
  const hasData = data.some((d) => d.actual > 0 || d.predicted > 0);
  const interval = tickInterval(data.length);
  const total = data[data.length - 1]?.cumulativeDisputes ?? 0;

  if (!hasData) {
    return (
      <section className="card card-pad">
        <p style={{ color: 'var(--muted)' }}>No dated shipments to plot.</p>
      </section>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel
        title="Billed against the model"
        meta={`${data.length} periods · gap is billed minus predicted`}
        legend={
          <div className="flex items-center gap-4 text-[13px]" style={{ color: 'var(--muted)' }}>
            <span className="flex items-center gap-2"><span className="h-[2px] w-4 rounded" style={{ background: 'var(--billed)' }} />Billed</span>
            <span className="flex items-center gap-2"><span className="h-[2px] w-4 rounded" style={{ background: 'var(--faint)' }} />Model</span>
          </div>
        }
      >
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 8, right: 28, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="month" tick={AXIS_TICK} axisLine={{ stroke: 'var(--line-strong)' }} tickLine={false} interval={interval} minTickGap={12} />
            <YAxis tickFormatter={(v) => formatDollarsShort(v)} tick={AXIS_TICK} axisLine={false} tickLine={false} width={52} />
            <Tooltip content={<ChargeTooltip />} cursor={{ stroke: 'var(--line-strong)' }} />
            <Line type="linear" dataKey="predicted" name="Model" stroke="var(--faint)" strokeWidth={1.5} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: 'var(--faint)' }} isAnimationActive={false} />
            <Line type="linear" dataKey="actual" name="Billed" stroke="var(--billed)" strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 0, fill: 'var(--billed)' }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="High-priority shipments" meta={`${total.toLocaleString()} across the file · per period`}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 8, right: 28, bottom: 0, left: 0 }} onMouseLeave={() => setActiveBar(null)}>
            <defs>
              <pattern id={patternId} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="7" height="7" style={{ fill: 'var(--hatch-bg)' }} />
                <line x1="0" y1="0" x2="0" y2="7" style={{ stroke: 'var(--hatch)' }} strokeWidth="1.5" />
              </pattern>
            </defs>
            <CartesianGrid stroke="var(--grid)" vertical={false} />
            <XAxis dataKey="month" tick={AXIS_TICK} axisLine={{ stroke: 'var(--line-strong)' }} tickLine={false} interval={interval} minTickGap={12} />
            <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} />
            <Tooltip content={<DisputeTooltip />} cursor={false} />
            <Bar
              dataKey="disputeCount"
              radius={[6, 6, 0, 0]}
              maxBarSize={40}
              isAnimationActive={false}
              onMouseEnter={(_, i) => setActiveBar(i)}
            >
              {data.map((d, i) => (
                <Cell
                  key={d.month}
                  fill={activeBar === i ? 'var(--over)' : `url(#${patternId})`}
                  stroke="var(--over)"
                  strokeWidth={activeBar === i ? 0 : 1}
                  strokeOpacity={0.6}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}
