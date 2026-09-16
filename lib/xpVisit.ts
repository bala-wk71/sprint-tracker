// Last total XP the user saw on the dashboard, kept in localStorage so the
// mascot can greet a visit with the delta. Client-only.

const KEY = "sprint-tracker:last-seen-xp";

export function getLastSeenXp(): number | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function setLastSeenXp(xp: number): void {
  try {
    window.localStorage.setItem(KEY, String(xp));
  } catch {
    // Storage unavailable — the mascot just stays quiet.
  }
}

// Whether this browser has already been told about the XP reset. Keyed by the
// reset's own date so a future reset shows its notice again rather than being
// swallowed by an old acknowledgement.
const RESET_KEY = "sprint-tracker:xp-reset-seen";

export function getSeenReset(): string | null {
  try {
    return window.localStorage.getItem(RESET_KEY);
  } catch {
    return null;
  }
}

export function setSeenReset(date: string): void {
  try {
    window.localStorage.setItem(RESET_KEY, date);
  } catch {
    // Storage unavailable — the notice may show again next visit. Better
    // twice than never.
  }
}
