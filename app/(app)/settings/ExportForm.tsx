"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { format, subDays, startOfWeek } from "date-fns";

function todayIso() {
  return format(new Date(), "yyyy-MM-dd");
}

function defaultFrom() {
  // Start of the current week (Monday)
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function ExportForm() {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(todayIso);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    if (!from || !to) {
      setError("Both dates are required.");
      return;
    }
    if (from > to) {
      setError("Start date must be before end date.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/export?from=${from}&to=${to}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Export failed.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sprint-log-${from}-to-${to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const setPreset = (days: number) => {
    setTo(todayIso());
    setFrom(format(subDays(new Date(), days - 1), "yyyy-MM-dd"));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[
          { label: "Last 7 days", days: 7 },
          { label: "Last 30 days", days: 30 },
          { label: "Last 90 days", days: 90 },
        ].map((p) => (
          <button
            key={p.days}
            type="button"
            onClick={() => setPreset(p.days)}
            className="rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:border-primary hover:text-foreground"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            From
          </label>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            To
          </label>
          <input
            type="date"
            value={to}
            min={from}
            max={todayIso()}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {loading ? "Exporting…" : "Export CSV"}
        </button>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Exports daily logs and time entries. Private entries are included since
        you own the data.
      </p>
    </div>
  );
}
