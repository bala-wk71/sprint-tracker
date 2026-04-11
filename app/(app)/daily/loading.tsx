export default function DailyLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-8 w-40 rounded-md bg-muted" />
        <div className="h-9 w-72 rounded-md bg-muted" />
      </div>

      {/* Morning check-in */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="h-5 w-36 rounded bg-muted" />
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 w-24 rounded-md bg-muted" />
          ))}
        </div>
        <div className="h-9 w-full rounded-md bg-muted" />
        <div className="h-16 w-full rounded-md bg-muted" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-10 w-full rounded-md bg-muted" />
          ))}
        </div>
        <div className="h-9 w-36 rounded-md bg-muted" />
      </div>

      {/* Time entries */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="h-5 w-28 rounded bg-muted" />
        <div className="h-24 w-full rounded-md bg-muted" />
      </div>

      {/* Evening wrap-up */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="h-5 w-36 rounded bg-muted" />
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-9 w-24 rounded-md bg-muted" />
          ))}
        </div>
        <div className="h-9 w-full rounded-md bg-muted" />
        <div className="h-20 w-full rounded-md bg-muted" />
        <div className="h-9 w-36 rounded-md bg-muted" />
      </div>
    </div>
  );
}
