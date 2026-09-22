"use client";

import type { TimerSettings } from "@/lib/timer/engine";

const NUMBER_FIELDS: { key: keyof TimerSettings; label: string; step?: number }[] = [
  { key: "focusMin", label: "Focus (min)" },
  { key: "shortBreakMin", label: "Short break (min)" },
  { key: "longBreakMin", label: "Long break (min)" },
  { key: "longBreakEvery", label: "Long break every" },
  { key: "dailyTargetHours", label: "Daily target (h)", step: 0.5 },
];

const TOGGLES: { key: keyof TimerSettings; label: string }[] = [
  { key: "autoStartBreaks", label: "Start breaks automatically" },
  { key: "autoStartFocus", label: "Start the next focus automatically" },
  { key: "countBreaks", label: "Count breaks toward the daily target" },
  { key: "sound", label: "Play a sound when time's up" },
];

export function TimerSettingsForm({
  settings,
  onChange,
}: {
  settings: TimerSettings;
  onChange: (patch: Partial<TimerSettings>) => void;
}) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {NUMBER_FIELDS.map((f) => (
          <label key={f.key} className="space-y-1">
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
              {f.label}
            </span>
            <input
              type="number"
              min={f.step ?? 1}
              step={f.step ?? 1}
              // Keyed on the saved value so a clamped entry snaps back.
              key={String(settings[f.key])}
              defaultValue={Number(settings[f.key])}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n !== settings[f.key]) onChange({ [f.key]: n });
              }}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        ))}
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {TOGGLES.map((t) => (
          <label key={t.key} className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={Boolean(settings[t.key])}
              onChange={(e) => onChange({ [t.key]: e.target.checked })}
              className="h-4 w-4 rounded border-input"
            />
            {t.label}
          </label>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Settings and the running timer are saved on this device.
      </p>
    </div>
  );
}
