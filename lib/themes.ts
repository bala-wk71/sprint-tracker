// The six looks the app ships. Dark and Light are the originals; the other
// four are add-ons that change font, spacing and wording as well as colour.
// The class next-themes puts on <html> is the theme id.

export const THEME_IDS = [
  "light",
  "dark",
  "jarvis",
  "retro",
  "pastel",
  "minimal",
] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** Themes that get the one-screen Home instead of the long dashboard. */
export const COMPACT_THEMES: readonly ThemeId[] = [
  "jarvis",
  "retro",
  "pastel",
  "minimal",
];

/** Themes with dark surfaces (charts and `dark:` utilities follow these). */
export const DARK_THEMES: readonly ThemeId[] = ["dark", "jarvis", "retro"];

/** Cookie the server reads so it can pick the right Home layout. */
export const THEME_COOKIE = "st-theme";

export function toThemeId(value: string | undefined | null): ThemeId | null {
  // "colourful" was the old name for what Pastel replaced.
  if (value === "colourful") return "pastel";
  return (THEME_IDS as readonly string[]).includes(value ?? "")
    ? (value as ThemeId)
    : null;
}

export function isDarkTheme(value: string | undefined | null): boolean {
  return (DARK_THEMES as readonly string[]).includes(value ?? "");
}

export type ThemeMeta = {
  id: ThemeId;
  name: string;
  blurb: string;
  /** Swatch colours for the picker: background, card, accent, second accent. */
  swatch: readonly [string, string, string, string];
};

export const THEMES: readonly ThemeMeta[] = [
  {
    id: "dark",
    name: "Dark",
    blurb: "The original dark look.",
    swatch: ["#0D1117", "#161B22", "#58A6FF", "#3FB950"],
  },
  {
    id: "light",
    name: "Light",
    blurb: "The original light look.",
    swatch: ["#FAF8F3", "#FFFFFF", "#0850C4", "#1F8A3B"],
  },
  {
    id: "jarvis",
    name: "Jarvis",
    blurb: "An assistant briefs you. Ask by typing or by voice.",
    swatch: ["#030B14", "#081826", "#38DCFF", "#FFB547"],
  },
  {
    id: "retro",
    name: "Retro gaming",
    blurb: "Red neon pixels. Quests, stages and coins.",
    swatch: ["#0D0208", "#1B0611", "#FF2D55", "#00F0FF"],
  },
  {
    id: "pastel",
    name: "Pastel",
    blurb: "Soft and colourful, friendly wording.",
    swatch: ["#FBF8FF", "#CFF5E1", "#E0D7FF", "#FFD9C7"],
  },
  {
    id: "minimal",
    name: "Minimal",
    blurb: "Just the app. No cards, no game layer.",
    swatch: ["#FFFFFF", "#F5F5F5", "#111111", "#6B6B6B"],
  },
];

// Wording that changes with the theme. Anything not listed here reads the
// same everywhere.
export type Vocab = {
  home: string;
  today: string;
  todo: string;
  money: string;
  greeting: string;
  steps: string;
  checkin: string;
  timeLog: string;
  wrapup: string;
  week: string;
  budgetLeft: string;
  nextBadge: string;
  level: string;
  xp: string;
  start: string;
  gain: (n: number) => string;
  loss: (n: number) => string;
  lossDetail: string;
  levelUp: (n: number, title: string) => string;
  badge: string;
};

const base: Vocab = {
  home: "Dashboard",
  today: "Daily Log",
  todo: "Todo",
  money: "Money",
  greeting: "Today",
  steps: "Today",
  checkin: "Morning check-in",
  timeLog: "Log time",
  wrapup: "Evening wrap-up",
  week: "This week",
  budgetLeft: "left this month",
  nextBadge: "Next badge",
  level: "Level",
  xp: "XP",
  start: "Open",
  gain: (n) => `+${n} XP`,
  loss: (n) => `-${n} XP`,
  lossDetail: "Log today and it stops.",
  levelUp: (n, title) => `Level ${n} · ${title}`,
  badge: "Achievement unlocked",
};

export const VOCAB: Record<ThemeId, Vocab> = {
  light: base,
  dark: base,
  jarvis: {
    ...base,
    home: "Briefing",
    today: "Today",
    todo: "Tasks",
    money: "Reserves",
    greeting: "Briefing",
    steps: "Today's protocol",
    checkin: "Morning status",
    timeLog: "Time on task",
    wrapup: "Evening debrief",
    week: "Week status",
    budgetLeft: "in reserve this month",
    nextBadge: "Next commendation",
    level: "Clearance",
    start: "Engage",
    gain: (n) => `+${n} XP logged`,
    loss: (n) => `${n} XP lost`,
    lossDetail: "Tracking lapsed. Log today to stabilise.",
    levelUp: (n, title) => `Clearance ${n} granted · ${title}`,
    badge: "Commendation recorded",
  },
  retro: {
    ...base,
    home: "Home",
    today: "Today",
    todo: "Quests",
    money: "Coins",
    greeting: "Player 1",
    steps: "Today's stages",
    checkin: "Stage 1 · Check in",
    timeLog: "Stage 2 · Log time",
    wrapup: "Stage 3 · Wrap up",
    week: "World map",
    budgetLeft: "coins left this month",
    nextBadge: "Next trophy",
    level: "LV",
    start: "Press start",
    gain: (n) => `+${n} XP`,
    loss: (n) => `-${n} XP`,
    lossDetail: "You took a hit. Log today to recover.",
    levelUp: (n, title) => `LEVEL UP! LV ${n} · ${title}`,
    badge: "Trophy get!",
  },
  pastel: {
    ...base,
    home: "Home",
    today: "Today",
    todo: "To-dos",
    money: "Money",
    greeting: "Hello",
    steps: "Your day",
    checkin: "Say good morning",
    timeLog: "Note your time",
    wrapup: "Wind down",
    week: "Your week",
    budgetLeft: "left to enjoy this month",
    nextBadge: "Almost there",
    start: "Let's go",
    gain: (n) => `Nice! +${n} XP`,
    loss: (n) => `${n} XP slipped away`,
    lossDetail: "No worries. A quick check-in today brings it back.",
    levelUp: (n, title) => `You reached level ${n} · ${title}`,
    badge: "New badge for you",
  },
  minimal: {
    ...base,
    home: "Home",
    today: "Today",
    steps: "Today",
    checkin: "Check-in",
    timeLog: "Time",
    wrapup: "Wrap-up",
    week: "Week",
    budgetLeft: "left this month",
    gain: (n) => `+${n} XP`,
    loss: (n) => `-${n} XP`,
    lossDetail: "",
    levelUp: (n) => `Level ${n}`,
    badge: "Badge",
  },
};
