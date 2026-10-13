// One place for every "you gained / lost XP" moment. Components call these
// helpers; XpToaster (mounted once in the app layout) draws the popup in the
// active theme's style. Client-only.

export type XpToastKind = "gain" | "loss" | "badge" | "level" | "info";

export type XpToastInput = {
  kind: XpToastKind;
  /** XP amount, always positive; the kind says whether it was won or lost. */
  amount?: number;
  /** Overrides the theme's default headline. */
  title?: string;
  detail?: string;
  /** Optional mascot image shown beside the message. */
  art?: string | null;
};

export const XP_TOAST_EVENT = "sprint-tracker:xp-toast";

export function xpToast(input: XpToastInput): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(XP_TOAST_EVENT, { detail: input }));
}

/** Announce XP earned by an action. Quietly does nothing for 0. */
export function announceXp(amount: number | null | undefined, detail?: string) {
  if (!amount || amount <= 0) return;
  xpToast({ kind: "gain", amount, detail });
}
