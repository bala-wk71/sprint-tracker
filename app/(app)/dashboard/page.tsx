export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">
          Your weekly sprint overview at a glance.
        </p>
      </div>

      {/* Placeholder cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Hours Logged", value: "0h", sub: "of 40h target" },
          { label: "Tasks Active", value: "0", sub: "this week" },
          { label: "Avg Productivity", value: "—", sub: "no data yet" },
          { label: "Priority Score", value: "—", sub: "no data yet" },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-border bg-card p-4"
          >
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">
              {card.value}
            </p>
            <p className="text-xs text-muted-foreground">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Task progress placeholder */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Task Progress
        </h2>
        <p className="text-muted-foreground">
          No sprint set up yet. Go to{" "}
          <a href="/sprint/setup" className="text-primary hover:underline">
            Sprint Setup
          </a>{" "}
          to create your first sprint.
        </p>
      </div>
    </div>
  );
}
