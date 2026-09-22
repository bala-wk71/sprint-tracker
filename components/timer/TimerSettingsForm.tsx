"use client";

import { Volume2 } from "lucide-react";
import { SOUND_KINDS, type SoundKind, type TimerSettings } from "@/lib/timer/engine";

const SOUND_LABEL: Record<SoundKind, string> = {
  chime: "Gentle chime",
  beep: "Beep",
  alarm: "Loud alarm",
};

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
  { key: "keepRinging", label: "Keep ringing until I stop it (up to 30s)" },
];

export function TimerSettingsForm({
  settings,
  onChange,
  onTestSound,
}: {
  settings: TimerSettings;
  onChange: (patch: Partial<TimerSettings>) => void;
  onTestSound: () => void;
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
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Sound"
          value={settings.soundKind}
          disabled={!settings.sound}
          onChange={(e) => onChange({ soundKind: e.target.value as SoundKind })}
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        >
          {SOUND_KINDS.map((k) => (
            <option key={k} value={k}>
              {SOUND_LABEL[k]}
            </option>
          ))}
        </select>
        <label className="flex min-w-40 flex-1 items-center gap-2 text-xs text-muted-foreground">
          Volume
          <input
            type="range"
            aria-label="Volume"
            min={5}
            max={100}
            step={5}
            disabled={!settings.sound}
            value={Math.round(settings.volume * 100)}
            onChange={(e) => onChange({ volume: Number(e.target.value) / 100 })}
            className="w-full accent-primary disabled:opacity-50"
          />
          <span className="w-9 tabular-nums">{Math.round(settings.volume * 100)}%</span>
        </label>
        <button
          type="button"
          onClick={onTestSound}
          disabled={!settings.sound}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50"
        >
          <Volume2 className="h-3.5 w-3.5" /> Test sound
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Settings and the running timer are saved on this device.
      </p>
    </div>
  );
}
