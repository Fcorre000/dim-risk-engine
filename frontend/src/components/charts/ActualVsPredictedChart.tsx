import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import type { MonthlyDataPoint } from '../../lib/metrics';
import { formatDollars } from '../../lib/metrics';

interface ActualVsPredictedChartProps {
  data: MonthlyDataPoint[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
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
        <p className="text-rose-400 mt-1 font-medium">Potential savings: +{formatDollars(gap)}</p>
      )}
    </div>
  );
}

interface GapLabelProps {
  x?: number;
  y?: number;
  width?: number;
  value?: number;
}

function GapLabel({ x = 0, y = 0, width = 0, value = 0 }: GapLabelProps) {
  if (value <= 0) return null;
  return (
    <text
      x={x + width / 2}
      y={y - 4}
      textAnchor="middle"
      fill="#f87171"
      fontSize={10}
      fontWeight={600}
    >
      +{formatDollars(value)}
    </text>
  );
}

export default function ActualVsPredictedChart({ data }: ActualVsPredictedChartProps) {
  const hasData = data.some((d) => d.actual > 0 || d.predicted > 0);

  if (!hasData) {
    return (
      <div className="rounded-xl bg-gray-900 border border-gray-800 px-6 py-10 flex items-center justify-center">
        <p className="text-sm text-gray-500">Upload an invoice to see actual vs predicted charges</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 px-6 py-5">
      <h2 className="text-sm font-semibold text-gray-100 mb-1">FedEx Billed vs Model Prediction</h2>
      <p className="text-xs text-gray-500 mb-4">
        Gap labels show how much FedEx charged above what the model predicted.{' '}
        Positive gap = potential savings if anomalies are disputed.
      </p>
      <div className="overflow-x-auto">
        <div style={{ minWidth: Math.max(400, data.length * 80) }}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={data}
              margin={{ top: 24, right: 16, bottom: 0, left: 16 }}
              barCategoryGap="30%"
              barGap={2}
            >
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
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Legend wrapperStyle={{ fontSize: '12px', color: '#9CA3AF', paddingTop: '8px' }} />
              <Bar dataKey="actual" name="FedEx Billed" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={32}>
                <LabelList dataKey="gap" content={<GapLabel />} />
              </Bar>
              <Bar dataKey="predicted" name="Model Predicted" fill="#4b5563" radius={[3, 3, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
