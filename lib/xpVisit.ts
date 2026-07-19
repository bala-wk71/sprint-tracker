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
