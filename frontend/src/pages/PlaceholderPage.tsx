interface PlaceholderPageProps {
  title: string;
}

export default function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className="flex items-center justify-center min-h-64">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-100 mb-2">{title}</h1>
        <p className="text-gray-500 text-sm">Coming in Phase 3+</p>
      </div>
    </div>
  );
}
