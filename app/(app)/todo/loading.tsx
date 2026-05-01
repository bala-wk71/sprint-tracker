export default function TodoLoading() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="h-8 w-24 animate-pulse rounded bg-muted" />
        <div className="h-4 w-52 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex gap-2">
        <div className="h-10 flex-1 animate-pulse rounded bg-muted" />
        <div className="h-10 flex-1 animate-pulse rounded bg-muted" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border p-4">
          <div className="h-5 w-32 animate-pulse rounded bg-muted" />
          {[1, 2].map((j) => (
            <div key={j} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ))}
    </div>
  );
}
