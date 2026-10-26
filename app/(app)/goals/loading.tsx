export default function GoalsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-32 rounded-md bg-muted" />
        <div className="h-4 w-full max-w-md rounded bg-muted" />
      </div>

      {/* Streams */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="h-5 w-32 rounded bg-muted" />
            <div className="h-4 w-24 rounded-full bg-muted" />
            <div className="h-1.5 w-full rounded-full bg-muted" />
          </div>
        ))}
      </div>

      {/* Goal rows */}
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border bg-card p-4">
            <div className="h-5 w-3/4 rounded bg-muted" />
            <div className="h-3 w-1/2 rounded bg-muted" />
            <div className="h-1.5 w-full rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
