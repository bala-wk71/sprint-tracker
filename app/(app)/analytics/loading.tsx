export default function AnalyticsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-32 rounded-md bg-muted" />
        <div className="h-4 w-64 rounded-md bg-muted" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Full-width area chart placeholder */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6 space-y-3">
          <div className="h-5 w-40 rounded bg-muted" />
          <div className="h-[260px] w-full rounded bg-muted" />
        </div>
        {/* Two half-width charts */}
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-6 space-y-3">
            <div className="h-5 w-40 rounded bg-muted" />
            <div className="h-[260px] w-full rounded bg-muted" />
          </div>
        ))}
        {/* Full-width pie chart placeholder */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6 space-y-3">
          <div className="h-5 w-36 rounded bg-muted" />
          <div className="h-[280px] w-full rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}
