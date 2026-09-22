# Focus timer (Pomodoro) — plan

## Goal
Start a timer against a sprint task from the daily log, leave it running while
you work (other pages, other tabs, a closed laptop), and have the focused time
land in **Time entries** on its own. Pomodoro mode alternates focus and breaks
(25 / 5, with a 15-minute long break every 4th session) so an 8-hour day gets
paced instead of ground through.

## Behaviour
- **Two modes**
  - *Pomodoro* — focus → short break → focus … → long break every N sessions.
  - *Timer* — a single countdown of any length ("work until it rings").
- **Runs in the background.** State is timestamps (`endsAt`), not a ticking
  counter, stored in `localStorage`. Closing the tab, navigating away or sleeping
  the laptop doesn't lose it; on return the timer catches up to the present.
- **Visible everywhere.** A pill in the header shows the phase and time left on
  every page and links back to the daily log. The tab title shows it too.
- **Rings when done.** Browser notification (after a one-time permission
  prompt), a short chime, and vibration on phones.
- **Logs itself.** Every finished focus session becomes a time entry for the
  chosen task, starting at the time the session started. Finishing early logs
  the minutes actually worked; *Reset* discards them. Logs that fail (offline)
  are queued and retried.
- **Auto-start.** Breaks start on their own by default; the next focus waits for
  you. Both are toggles. A focus session is never auto-started for a timer
  nobody was watching, so a laptop left closed can't invent hours of work.
- **8-hour day.** The panel shows today's logged hours against a daily target
  (default 8h) with "about N more sessions to go", and a toggle to count breaks
  toward the target.
- **Settings** (per device): focus / short / long minutes, long break every N,
  auto-start breaks / focus, sound, daily target, count breaks.

## Design choices
- **Device-local state, server-side results.** The running timer lives in the
  browser (no migration, works offline, instant). Only the outcome — time
  entries — goes to Supabase through the existing `addTimeEntry` action, so RLS,
  XP and privacy rules apply unchanged. Trade-off: a timer started on the laptop
  isn't visible on the phone.
- **Cross-tab safety.** State changes and log flushing run inside a Web Lock
  (`navigator.locks`) and re-read storage inside it, so two open tabs can't log
  the same session twice. Tabs sync through the `storage` event.
- **Pure engine.** `lib/timer/engine.ts` holds all the transition logic
  (start, pause, resume, finish, skip, catch-up) as pure functions with unit
  tests; React only renders and persists.

## Files
- `lib/timer/engine.ts` (+ `engine.test.ts`) — state machine.
- `components/timer/FocusTimerProvider.tsx` — context, storage, ticking,
  notifications, log flushing. Mounted in `app/(app)/layout.tsx`.
- `components/timer/FocusTimerPanel.tsx` — the controls on `/daily`.
- `components/timer/TimerPill.tsx` — header indicator.

## Verification
Unit tests for the engine; then on the deployed app at 375 / 768 / 1440px:
start a Pomodoro against a task, pause / resume, navigate away and back (pill),
reload mid-session, finish early → entry appears, break starts, skip break,
Timer mode countdown, settings persist, reset discards.
