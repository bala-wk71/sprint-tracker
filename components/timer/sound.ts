import type { SoundKind } from "@/lib/timer/engine";

/**
 * Timer sounds, synthesised with Web Audio so there are no files to load and
 * nothing to fail offline.
 *
 * Browsers only let a page make sound after the user has interacted with it,
 * so the context is created on the first click or key press anywhere on the
 * page (see `unlockAudioOnGesture`), not only on the timer's own buttons.
 * That matters after a reload: without it, a session that finishes before
 * you touch the page would ring silently.
 */

let ctx: AudioContext | null = null;
let out: AudioNode | null = null;

export function primeAudio() {
  try {
    if (!ctx) {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      ctx = new Ctx();
      // A compressor lets the alarm be loud without clipping into distortion.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 4;
      comp.connect(ctx.destination);
      out = comp;
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
    out = null;
  }
}

/** Arm audio on the first interaction with the page. Returns a cleanup. */
export function unlockAudioOnGesture(): () => void {
  const unlock = () => primeAudio();
  const opts = { capture: true, passive: true } as const;
  window.addEventListener("pointerdown", unlock, opts);
  window.addEventListener("keydown", unlock, opts);
  return () => {
    window.removeEventListener("pointerdown", unlock, opts);
    window.removeEventListener("keydown", unlock, opts);
  };
}

export function audioReady(): boolean {
  return ctx !== null && ctx.state === "running";
}

type Note = { freq: number; start: number; len: number; type: OscillatorType; peak: number };

const PATTERNS: Record<SoundKind, Note[]> = {
  // Three soft rising-falling notes.
  chime: [880, 660, 880].map((freq, i) => ({
    freq,
    start: i * 0.28,
    len: 0.26,
    type: "sine" as const,
    peak: 0.6,
  })),
  // Three sharp microwave-style beeps.
  beep: [0, 1, 2].map((i) => ({
    freq: 1000,
    start: i * 0.25,
    len: 0.15,
    type: "square" as const,
    peak: 0.35,
  })),
  // Alarm clock: fast two-tone warble, twice.
  alarm: Array.from({ length: 10 }, (_, i) => ({
    freq: i % 2 === 0 ? 988 : 1319,
    start: i * 0.13 + (i >= 5 ? 0.2 : 0),
    len: 0.12,
    type: "sawtooth" as const,
    peak: 0.55,
  })),
};

/** Play one round of a sound. Silently does nothing if audio isn't unlocked. */
export function playSound(kind: SoundKind, volume: number) {
  if (!ctx || !out) return;
  if (ctx.state === "suspended") void ctx.resume();
  try {
    const t0 = ctx.currentTime + 0.02;
    for (const n of PATTERNS[kind]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type;
      osc.frequency.value = n.freq;
      const start = t0 + n.start;
      const peak = Math.max(0.0002, n.peak * volume);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.01);
      gain.gain.setValueAtTime(peak, start + n.len * 0.7);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + n.len);
      osc.connect(gain).connect(out);
      osc.start(start);
      osc.stop(start + n.len + 0.02);
    }
  } catch {
    // Sound is a nicety; the notification and on-screen state still land.
  }
}

/** Gap between repeats while an alarm keeps ringing. */
export const RING_EVERY_MS = 2000;
/** Stop ringing on its own after this long, in case you really are away. */
export const RING_MAX_MS = 30_000;
