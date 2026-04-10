export default function ReviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reviewing</h1>
        <p className="text-muted-foreground">
          View progress of people you&apos;re reviewing.
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-muted-foreground">
          You&apos;re not reviewing anyone yet.
        </p>
      </div>
    </div>
  );
}
