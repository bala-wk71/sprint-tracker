import { format } from "date-fns";

export type HeatmapDay = {
  date: string;
  hours: number;
  /** Days padded in to complete the first week render dimmed. */
  inWindow: boolean;
  logged: boolean;
};

// Sequential blue ramp (one hue, low → high); 0h stays on the surface.
function heatVar(hours: number): string | null {
  if (hours <= 0) return null;
  if (hours < 1) return "--viz-heat-1";
  if (hours < 2.5) return "--viz-heat-2";
  if (hours < 5) return "--viz-heat-3";
  return "--viz-heat-4";
}

const WEEKDAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

export function ConsistencyHeatmap({ days }: { days: HeatmapDay[] }) {
  // Column-per-week grid, Monday-first.
  const weeks: HeatmapDay[][] = [];
  for (const day of days) {
    const wd = new Date(`${day.date}T00:00:00`).getDay();
    const row = wd === 0 ? 6 : wd - 1;
    if (row === 0 || weeks.length === 0) weeks.push([]);
    weeks[weeks.length - 1][row] = day;
  }

  const activeDays = days.filter((d) => d.inWindow && d.hours > 0).length;
  const windowDays = days.filter((d) => d.inWindow).length;

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Consistency</h2>
          <p className="text-xs text-muted-foreground">
            Hours logged per day — showing up is the game
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {activeDays} of {windowDays} days active
        </span>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="flex gap-1">
          {/* Weekday gutter */}
          <div className="mr-1 grid shrink-0 grid-rows-7 gap-1">
            {WEEKDAY_LABELS.map((label, i) => (
              <span
                key={i}
                className="flex h-5 items-center text-[10px] leading-none text-muted-foreground"
              >
                {label}
              </span>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="grid shrink-0 grid-rows-7 gap-1">
              {Array.from({ length: 7 }, (_, row) => {
                const day = week[row];
                if (!day) {
                  return <span key={row} className="h-5 w-5" />;
                }
                const v = heatVar(day.hours);
                const label = `${format(new Date(`${day.date}T00:00:00`), "EEE, MMM d")}: ${
                  day.hours > 0
                    ? `${day.hours.toFixed(1)}h logged`
                    : day.logged
                      ? "checked in, no time logged"
                      : "no log"
                }`;
                return (
                  <span
                    key={row}
                    title={label}
                    className={`h-5 w-5 rounded-[4px] transition-transform hover:scale-110 hover:ring-2 hover:ring-ring ${
                      v ? "" : day.logged ? "bg-muted" : "bg-muted/50"
                    } ${day.inWindow ? "" : "opacity-40"}`}
                    style={v ? { backgroundColor: `var(${v})` } : undefined}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Scale legend for the sequential ramp */}
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
        <span>0h</span>
        <span className="h-3 w-3 rounded-[3px] bg-muted/50" />
        {["--viz-heat-1", "--viz-heat-2", "--viz-heat-3", "--viz-heat-4"].map(
          (v) => (
            <span
              key={v}
              className="h-3 w-3 rounded-[3px]"
              style={{ backgroundColor: `var(${v})` }}
            />
          )
        )}
        <span>5h+</span>
      </div>
    </section>
  );
}
