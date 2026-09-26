"use client";

import { useState } from "react";
import { Bell, BellOff, Pause, Play, RotateCcw, Settings2, SkipForward, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PHASE_LABEL, formatClock, localDate, type TimerMode } from "@/lib/timer/engine";
import type { SprintTaskOption } from "@/app/(app)/daily/TimeEntries";
import { useFocusTimer } from "./FocusTimerProvider";
import { TimerSettingsForm } from "./TimerSettingsForm";
import { DayTarget } from "./DayTarget";
import { TaskProgress, type TimerTaskProgress } from "./TaskProgress";

const PRESETS = [15, 25, 45, 60, 90];
const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60";

export function FocusTimerPanel({
  tasks,
  workHours,
  taskProgress,
}: {
  tasks: SprintTaskOption[];
  /** Today's hours on non-Personal sprint tasks — what the daily target counts. */
  workHours: number;
  taskProgress: TimerTaskProgress[];
}) {
  const timer = useFocusTimer();
  const { state, remaining, now } = timer;
  const run = state.run;
  const [mode, setMode] = useState<TimerMode>("pomodoro");
  const [taskId, setTaskId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [minutes, setMinutes] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const timerMinutes = minutes ?? state.settings.timerMin;
  const activeMode = run?.mode ?? mode;
  const currentTaskId = run ? run.taskId ?? "" : taskId;
  const currentNotes = run ? run.notes : notes;

  const pickTask = (id: string) => {
    const name = tasks.find((t) => t.id === id)?.name ?? null;
    if (run) timer.setTask({ taskId: id || null, taskName: name });
    else setTaskId(id);
  };

  const start = () => {
    const task = tasks.find((t) => t.id === taskId);
    timer.start({
      mode,
      minutes: mode === "timer" ? timerMinutes : undefined,
      taskId: task?.id ?? null,
      taskName: task?.name ?? null,
      notes,
    });
  };

  const isFocus = run?.phase === "focus";
  const elapsedMin = run && isFocus ? Math.floor((run.durationMs - remaining) / 60_000) : 0;
  const progress = run ? 1 - remaining / run.durationMs : 0;
  const clock = run
    ? formatClock(remaining)
    : formatClock((activeMode === "timer" ? timerMinutes : state.settings.focusMin) * 60_000);
  const today = localDate(now);
  const stats = state.days[today];
  // Sessions finished but not yet saved count straight away, by the same rule
  // the server total uses: only time on a non-Personal task is work.
  const workTaskIds = new Set(tasks.filter((t) => t.category !== "personal").map((t) => t.id));
  const pendingToday = state.pending.filter((p) => p.date === today);
  const pendingWorkHours =
    pendingToday
      .filter((p) => p.taskId && workTaskIds.has(p.taskId))
      .reduce((sum, p) => sum + p.minutes, 0) / 60;
  const selectedTask = tasks.find((t) => t.id === currentTaskId);
  const selectedProgress = taskProgress.find((t) => t.id === currentTaskId);
  const selectedPendingHours =
    pendingToday.filter((p) => p.taskId === currentTaskId).reduce((sum, p) => sum + p.minutes, 0) / 60;
  const recent = state.last && now - state.last.at < 15 * 60_000 ? state.last : null;

  const confirmReset = () => {
    if (isFocus && run?.status !== "ready" && elapsedMin >= 1) {
      if (!confirm(`Discard ${elapsedMin} min of this session without logging it?`)) return;
    }
    timer.reset();
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <div role="tablist" aria-label="Timer mode" className="flex rounded-lg border border-border p-0.5">
          {(["pomodoro", "timer"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={activeMode === m}
              disabled={Boolean(run)}
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed",
                activeMode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {m === "pomodoro" ? "Pomodoro" : "Timer"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          aria-label="Timer settings"
          aria-expanded={showSettings}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>

      {showSettings && (
        <TimerSettingsForm
          settings={state.settings}
          onChange={timer.setSettings}
          onTestSound={timer.testSound}
        />
      )}

      {timer.ringing && (
        <button
          type="button"
          onClick={timer.stopAlarm}
          className="flex w-full animate-pulse items-center justify-center gap-2 rounded-md bg-destructive px-3 py-3 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90"
        >
          <BellOff className="h-4 w-4" /> Stop alarm
        </button>
      )}

      {recent && (
        <div className="flex items-start justify-between gap-2 rounded-md border border-[hsl(var(--strong-signal))]/30 bg-[hsl(var(--strong-signal))]/10 px-3 py-2 text-xs text-foreground">
          <p>
            {recent.phase === "focus"
              ? `${recent.mode === "timer" ? "Timer done" : "Focus session done"} — ${recent.minutes} min${recent.taskName ? ` on ${recent.taskName}` : ""} added to today's entries.`
              : `${PHASE_LABEL[recent.phase]} over — ready when you are.`}
          </p>
          <button type="button" onClick={timer.dismissLast} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
        <Ring progress={progress} phase={run?.phase ?? "focus"}>
          <span
            className={cn(
              "font-mono font-semibold tabular-nums text-foreground",
              // h:mm:ss is two characters wider than mm:ss; at the mm:ss size
              // it runs past the ring.
              clock.length > 5 ? "text-2xl" : "text-3xl"
            )}
            data-testid="timer-clock"
          >
            {clock}
          </span>
          <span className="max-w-[6rem] text-center text-[11px] uppercase leading-tight tracking-wide text-muted-foreground">
            {run
              ? run.status === "paused"
                ? "Paused"
                : run.status === "ready"
                  ? `Up next · ${PHASE_LABEL[run.phase]}`
                  : run.mode === "timer"
                    ? "Timer"
                    : PHASE_LABEL[run.phase]
              : "Ready"}
          </span>
        </Ring>

        <div className="w-full min-w-0 flex-1 space-y-2">
          <select
            aria-label="Task"
            value={currentTaskId}
            onChange={(e) => pickTask(e.target.value)}
            className={inputClass}
          >
            <option value="">— No task —</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input
            aria-label="What are you working on?"
            value={currentNotes}
            onChange={(e) => (run ? timer.setTask({ notes: e.target.value }) : setNotes(e.target.value))}
            placeholder="What are you working on?"
            maxLength={500}
            className={inputClass}
          />
          {selectedTask && selectedProgress ? (
            <TaskProgress
              name={selectedTask.name}
              progress={selectedProgress}
              pendingHours={selectedPendingHours}
            />
          ) : (
            tasks.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Pick a task so this session counts toward it and your daily target.
              </p>
            )
          )}
          {!run && activeMode === "timer" && (
            <div className="flex flex-wrap items-center gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setMinutes(p)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs",
                    timerMinutes === p
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent"
                  )}
                >
                  {p}m
                </button>
              ))}
              <input
                type="number"
                aria-label="Timer minutes"
                min={1}
                max={600}
                value={timerMinutes}
                onChange={(e) => setMinutes(Math.max(1, Math.min(600, Number(e.target.value) || 1)))}
                className="w-20 rounded-md border border-input bg-background px-2 py-0.5 text-xs text-foreground"
              />
              <span className="text-xs text-muted-foreground">min</span>
            </div>
          )}
          {activeMode === "pomodoro" && (
            <CycleDots done={run?.cycle ?? 0} total={state.settings.longBreakEvery} />
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!run && (
          <Btn primary onClick={start} icon={Play}>
            {mode === "timer" ? `Start ${timerMinutes} min timer` : `Start focus · ${state.settings.focusMin} min`}
          </Btn>
        )}
        {run?.status === "ready" && (
          <>
            <Btn primary onClick={() => timer.startNext()} icon={Play}>
              Start {PHASE_LABEL[run.phase].toLowerCase()} · {Math.round(run.durationMs / 60_000)} min
            </Btn>
            {!isFocus && <Btn onClick={timer.finish} icon={SkipForward}>Skip break</Btn>}
          </>
        )}
        {run?.status === "running" && <Btn onClick={timer.pause} icon={Pause}>Pause</Btn>}
        {run?.status === "paused" && <Btn primary onClick={timer.resume} icon={Play}>Resume</Btn>}
        {run && run.status !== "ready" && (
          <Btn onClick={timer.finish} icon={isFocus ? Square : SkipForward}>
            {isFocus ? (elapsedMin >= 1 ? `Done · log ${elapsedMin} min` : "Done") : "Skip break"}
          </Btn>
        )}
        {run && (
          <Btn onClick={confirmReset} icon={RotateCcw}>
            {run.status === "ready" ? "End session" : "Reset"}
          </Btn>
        )}
      </div>

      {timer.notifyPermission === "default" && (
        <button
          type="button"
          onClick={timer.requestNotifications}
          className="flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <Bell className="h-3.5 w-3.5" /> Notify me when time&apos;s up
        </button>
      )}
      {timer.notifyPermission === "denied" && (
        <p className="text-[11px] text-muted-foreground">
          Notifications are blocked for this site — the tab title and sound still tell you when time&apos;s up.
        </p>
      )}

      {timer.logError && (
        <p className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Couldn&apos;t save a finished session ({timer.logError}). It&apos;s kept on this device.
          <button type="button" onClick={timer.retryLogs} className="font-medium underline">
            Retry now
          </button>
        </p>
      )}

      {timer.droppedLog && (
        <div className="flex items-start justify-between gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <p>{timer.droppedLog}</p>
          <button type="button" onClick={timer.dismissDropped} aria-label="Dismiss" className="hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <DayTarget
        workHours={workHours + pendingWorkHours}
        hasWorkTasks={workTaskIds.size > 0}
        breakHours={(stats?.breakMinutes ?? 0) / 60}
        sessions={stats?.focusSessions ?? 0}
        settings={state.settings}
      />
    </div>
  );
}

function Btn({
  children,
  onClick,
  icon: Icon,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
        primary
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "border border-border text-foreground hover:bg-accent"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function Ring({
  progress,
  phase,
  children,
}: {
  progress: number;
  phase: "focus" | "short" | "long";
  children: React.ReactNode;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="8" className="stroke-muted" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, progress)))}
          className={cn(
            "transition-[stroke-dashoffset] duration-1000 ease-linear",
            phase === "focus" ? "stroke-primary" : "stroke-[hsl(var(--strong-signal))]"
          )}
        />
      </svg>
      {/* Inset so the text stays inside the stroke rather than just the box. */}
      <div className="absolute inset-3 flex flex-col items-center justify-center gap-0.5">{children}</div>
    </div>
  );
}

function CycleDots({ done, total }: { done: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`${done} of ${total} sessions before the long break`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn("h-2 w-2 rounded-full", i < done ? "bg-primary" : "bg-muted")}
        />
      ))}
      <span className="ml-1 text-[11px] text-muted-foreground">
        {done}/{total} before the long break
      </span>
    </div>
  );
}
