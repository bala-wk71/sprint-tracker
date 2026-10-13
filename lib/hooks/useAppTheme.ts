"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { VOCAB, toThemeId, type ThemeId, type Vocab } from "@/lib/themes";

const emptySubscribe = () => () => {};

/**
 * The active theme id and its wording. Before hydration (and on the server)
 * this reports `fallback`, so themed copy never causes a hydration mismatch.
 */
export function useAppTheme(fallback: ThemeId = "light"): {
  theme: ThemeId;
  vocab: Vocab;
  mounted: boolean;
  setTheme: (id: ThemeId) => void;
} {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const id = mounted
    ? toThemeId(theme === "system" ? resolvedTheme : theme) ?? fallback
    : fallback;
  return { theme: id, vocab: VOCAB[id], mounted, setTheme };
}
