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

function ChargeTooltip({ active, payload, label }: ChargeTooltipProps) {
  if (!active || !payload?.length) return null;
  const actual = payload.find((p) => p.name === 'FedEx Billed')?.value ?? 0;
  const predicted = payload.find((p) => p.name === 'Model Predicted')?.value ?? 0;
  const gap = actual - predicted;
  return (
    <div className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-gray-100 mb-1.5">{label}</p>
      <p className="text-blue-400">FedEx Billed: {formatDollars(actual)}</p>
      <p className="text-gray-400">Model Predicted: {formatDollars(predicted)}</p>
      {gap > 0 && (
        <p className="text-rose-400 mt-1 font-medium">Gap: +{formatDollars(gap)}</p>
      )}
    </div>
  );
}

interface DisputeTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
  label?: string;
}

function DisputeTooltip({ active, payload, label }: DisputeTooltipProps) {
  if (!active || !payload?.length) return null;
  const monthly = payload.find((p) => p.name === 'New Disputes')?.value ?? 0;
  const cumulative = payload.find((p) => p.name === 'Cumulative')?.value ?? 0;
  return (
    <div className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-gray-100 mb-1.5">{label}</p>
      <p className="text-rose-400">New Disputes: {monthly}</p>
      <p className="text-amber-400">Cumulative: {cumulative}</p>
    </div>
  );
}

export default function TrendsChart({ data }: TrendsChartProps) {
  const hasData = data.some((d) => d.actual > 0 || d.predicted > 0);

  return (
    <div className="space-y-6">
      {/* Chart 1: Actual vs Predicted charge line chart */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 px-6 py-5">
        <h2 className="text-sm font-semibold text-gray-100 mb-1">
          Actual vs Predicted Charge — Month Over Month
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          FedEx billed vs model prediction per monthly bucket. Rising gap signals increasing overcharges.{' '}
          <span className="text-gray-600">Monthly buckets are synthetic (shipment date not in invoice response).</span>
        </p>
        {!hasData ? (
          <div className="h-[280px] flex items-center justify-center">
            <p className="text-sm text-gray-500">Upload an invoice to see charge trends</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: '#9CA3AF', fontSize: 12 }}
                axisLine={{ stroke: '#374151' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                tick={{ fill: '#9CA3AF', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<ChargeTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)' }} />
              <Legend wrapperStyle={{ fontSize: '12px', color: '#9CA3AF', paddingTop: '8px' }} />
              <Line
                type="monotone"
                dataKey="actual"
                name="FedEx Billed"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="predicted"
                name="Model Predicted"
                stroke="#6b7280"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={{ fill: '#6b7280', r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Chart 2: Dispute candidate count over time */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 px-6 py-5">
        <h2 className="text-sm font-semibold text-gray-100 mb-1">
          Dispute Candidates Over Time
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          New and cumulative DIM anomaly ("Unexpected") shipments per monthly bucket. Upward cumulative trend means disputes are accumulating.
        </p>
        {!hasData ? (
          <div className="h-[280px] flex items-center justify-center">
            <p className="text-sm text-gray-500">Upload an invoice to see dispute trends</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: '#9CA3AF', fontSize: 12 }}
                axisLine={{ stroke: '#374151' }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: '#9CA3AF', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<DisputeTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)' }} />
              <Legend wrapperStyle={{ fontSize: '12px', color: '#9CA3AF', paddingTop: '8px' }} />
              <Line
                type="monotone"
                dataKey="disputeCount"
                name="New Disputes"
                stroke="#f43f5e"
                strokeWidth={2}
                dot={{ fill: '#f43f5e', r: 3 }}
                activeDot={{ r: 5 }}
              />
              <Line
                type="monotone"
                dataKey="cumulativeDisputes"
                name="Cumulative"
                stroke="#f59e0b"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={{ fill: '#f59e0b', r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
