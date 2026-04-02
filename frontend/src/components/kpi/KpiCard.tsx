interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  accent?: 'default' | 'blue' | 'amber' | 'rose' | 'emerald';
}

const ACCENT_CLASSES: Record<NonNullable<KpiCardProps['accent']>, string> = {
  default: 'text-gray-100',
  blue: 'text-blue-400',
  amber: 'text-amber-400',
  rose: 'text-rose-400',
  emerald: 'text-emerald-400',
};

export default function KpiCard({ title, value, subtitle, accent = 'default' }: KpiCardProps) {
  return (
    <div
      role="region"
      aria-label={title}
      className="rounded-xl bg-gray-900 border border-gray-800 px-6 py-5"
    >
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{title}</p>
      <p className={`text-3xl font-bold tabular-nums ${ACCENT_CLASSES[accent]}`}>{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1.5">{subtitle}</p>}
    </div>
  );
}
