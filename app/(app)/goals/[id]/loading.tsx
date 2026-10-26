export default function GoalLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-4 w-20 rounded bg-muted" />
      <div className="space-y-2">
        <div className="h-4 w-48 rounded bg-muted" />
        <div className="h-8 w-3/4 rounded-md bg-muted" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-6">
          <div className="h-5 w-28 rounded bg-muted" />
          <div className="h-2 w-full rounded-full bg-muted" />
          <div className="h-10 w-full rounded-md bg-muted" />
        </div>
      ))}
    </div>
  );
}
