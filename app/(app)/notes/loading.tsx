export default function NotesLoading() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="h-8 w-28 animate-pulse rounded bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex gap-2">
        <div className="h-10 w-44 animate-pulse rounded bg-muted" />
        <div className="h-10 w-32 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="space-y-2 rounded-lg border border-border p-4">
            <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            {[1, 2, 3].map((j) => (
              <div key={j} className="h-9 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
