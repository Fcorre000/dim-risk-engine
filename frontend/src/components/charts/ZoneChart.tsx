import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { ZoneDataPoint } from '../../lib/metrics';

interface ZoneChartProps {
  data: ZoneDataPoint[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: ZoneDataPoint }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-gray-100 mb-1">Zone {label}</p>
      <p className="text-gray-400">
        DIM flag rate: <span className="text-blue-400 font-medium">{d.dimRate}%</span>
      </p>
      <p className="text-gray-400">Shipments: {d.count.toLocaleString()}</p>
    </div>
  );
}

export default function ZoneChart({ data }: ZoneChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl bg-gray-900 border border-gray-800 px-6 py-10 flex items-center justify-center">
        <p className="text-sm text-gray-500">Upload an invoice to see DIM flag rate by zone</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 px-6 py-5">
      <h2 className="text-sm font-semibold text-gray-100 mb-1">DIM Flag Rate by Zone</h2>
      <p className="text-xs text-gray-500 mb-4">
        Percentage of shipments flagged as DIM-billed, per pricing zone
      </p>
      <ResponsiveContainer width="100%" height={data.length * 44 + 40}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 48, bottom: 0, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: '#9CA3AF', fontSize: 11 }}
            axisLine={{ stroke: '#374151' }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="zone"
            tick={{ fill: '#9CA3AF', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `Zone ${v}`}
            width={56}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Bar dataKey="dimRate" radius={[0, 4, 4, 0]} maxBarSize={24}>
            {data.map((entry) => (
              <Cell
                key={entry.zone}
                fill={entry.dimRate > 50 ? '#f87171' : entry.dimRate > 25 ? '#fbbf24' : '#60a5fa'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
