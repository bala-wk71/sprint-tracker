// Icon-related helpers that pair with constants.ts.
//
// Note: mood, energy, and priority status selectors intentionally keep their
// emoji glyphs — those are expressive UI elements where emoji adds value.
// This file is for icon-system bits used outside of those selectors.

import type { TaskCategory } from "./constants";

// Tailwind dot classes for category swatches (used by CategoryBadge).
export const CATEGORY_DOT_CLASSES: Record<TaskCategory, string> = {
  strong_signal: "bg-strong-signal",
  weak_signal: "bg-weak-signal",
  strong_noise: "bg-strong-noise",
  weak_noise: "bg-weak-noise",
  personal: "bg-personal",
};
