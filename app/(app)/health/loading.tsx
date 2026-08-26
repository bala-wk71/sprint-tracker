export default function HealthLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-32 rounded-xl border border-border bg-card p-4"
          />
        ))}
      </div>
      <div className="h-64 rounded-xl border border-border bg-card p-6" />
      <div className="h-48 rounded-xl border border-border bg-card p-6" />
    </div>
  );
}
