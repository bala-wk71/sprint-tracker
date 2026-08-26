import Link from "next/link";

export default function HealthOverviewPage() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
      <p className="text-sm text-muted-foreground">
        Start with{" "}
        <Link href="/health/goals" className="text-primary hover:underline">
          your goals
        </Link>
        , then log a workout, a meal or a weigh-in.
      </p>
    </div>
  );
}
