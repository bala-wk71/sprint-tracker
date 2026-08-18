# Signal / Noise Categories — Labelling Plan

- Date: 2026-08-18
- Status: **Phases 1-3 implemented** (Option B). Phase 4 not built.
  Colour was reassigned to follow the action ladder — see section 5.
- Trigger: "the strong weak signal and noise are confusing on where to put what
  so some clear labels there would help."

Findings below come from reading the code, not the live site.

---

## 1. What is actually wrong

### The explanations already exist. They are rendered nowhere.

`lib/constants.ts` gives every category a `description` and a `priority`:

```ts
strong_signal: { label: "Strong Signal", priority: "First",     description: "High value + clear path" },
weak_signal:   { label: "Weak Signal",   priority: "Second",    description: "Valuable but unclear" },
strong_noise:  { label: "Strong Noise",  priority: "Limit",     description: "Clear but low value" },
weak_noise:    { label: "Weak Noise",    priority: "Eliminate", description: "Low value + unclear" },
personal:      { label: "Personal",      priority: "Fixed",     description: "Life essentials" },
```

Grepping `.description` and `.priority` across `app/`, `components/` and `lib/`
returns **nothing**. Both fields are dead. At the moment of choosing, the UI is
a bare `<select>` with five jargon labels and no hint of what separates them:

```
┌──────────────────┐
│ Strong Signal  ▾ │   ← the entire affordance, in three places
└──────────────────┘
```

So this is not primarily a naming problem. The words that would resolve the
confusion were written down a year ago and never reached the screen.

### The names invert the meaning of "strong"

There are two independent axes hiding in four labels:

| | **clear path** | **unclear path** |
|---|---|---|
| **worth doing** | Strong Signal — *do first* | Weak Signal — *do second* |
| **not worth doing** | Strong Noise — *limit* | Weak Noise — *eliminate* |

- `signal` / `noise` encodes **value** — is this worth your week?
- `strong` / `weak` encodes **clarity** — do you know how to do it?

Nothing in the words says that. "Strong" reads as *important*, so:

- **"Strong Noise" sounds like the worst quadrant.** It is not — it is the
  third. It is the clear, low-value work: status decks, expense reports,
  the recurring sync. You *limit* it, you do not eliminate it.
- **"Weak Noise" sounds like the mildest quadrant.** It is the one you are
  meant to delete outright.

The `priority` ladder (First → Second → Limit → Eliminate) contradicts the
intuitive reading of strong-vs-weak at two of the four rungs. That is exactly
the "where do I put what" hesitation.

### The obvious rename is already taken

`lib/gamification.ts` spends this exact vocabulary on the level ladder:

```
1 Static · 2 Faint Signal · 3 Emerging Signal · 4 Steady Signal ·
5 Clear Signal · 6 Strong Signal · 7 Focused Signal · 8 Amplified Signal ·
9 Pure Signal · 10 Beacon · 11 Radiant Beacon · 12 Lighthouse
```

**"Clear Signal" is already level 5, and "Strong Signal" is already level 6.**
Any relabelling that reaches for "clear" collides with a word the app puts on
your profile — "you are a Clear Signal" and "this task is a Clear Signal" would
be unrelated meanings of the same phrase. This rules out the first rename most
people would try, and constrains Option B below.

### Three smaller defects found on the way

1. **Two pickers in `TasksEditor.tsx` disagree.** The new-task select renders
   `{meta.emoji} {meta.label}` (line 269) — `🟢 Strong Signal`. The edit-draft
   select above it (line ~165) renders the label alone. Same page, same list,
   different presentation. The emoji field is used at this one call site and
   nowhere else, and coloured-circle emoji as UI icons runs against the rest of
   the app, which uses lucide icons and a `CATEGORY_DOT_CLASSES` span.
2. **`SignalMeter.tsx` hardcodes its own copy of the labels** in `SEGMENTS`
   rather than reading `TASK_CATEGORIES`. Any rename has to be made twice or
   the analytics legend silently drifts from the picker.
3. **No legend anywhere.** Analytics shows a "Signal quality" percentage and a
   stacked meter, but nothing on that page says what counts as signal.

### What is *not* wrong

The database enum (`public.task_category`) stores `strong_signal`,
`weak_signal`, … and is entirely separate from the display label. **Every
option below is a UI-only change: no migration, no data rewrite, no risk to
existing sprints.** Only the strings people read change.

---

## 2. Options for the labels

### Option A — keep the names, teach them at the point of choice

Leave `label` alone. Surface `description` and `priority`, and show the 2×2 so
the two axes are visible while choosing.

- **For:** zero relabelling; preserves the vocabulary already used in
  Analytics ("Signal quality", "signal ÷ (signal + noise)") and in the sprint
  history you have already tagged.
- **Against:** "Strong Noise" still reads wrong on a badge, where there is no
  room for a description. The tooltip fixes the picker, not the badge.

### Option B — rename the clarity axis only *(recommended)*

Keep Signal/Noise as the family. Replace strong/weak with words that actually
mean clarity:

| enum value | today | proposed |
|---|---|---|
| `strong_signal` | Strong Signal | **Sharp Signal** |
| `weak_signal` | Weak Signal | **Fuzzy Signal** |
| `strong_noise` | Strong Noise | **Sharp Noise** |
| `weak_noise` | Weak Noise | **Fuzzy Noise** |
| `personal` | Personal | Personal *(unchanged)* |

Sharp/fuzzy rather than clear/fuzzy, because of the level-title collision
above. It is the same idea with a word the app has not already spent.

- **For:** the axis stops lying — "sharp" and "fuzzy" describe how well you can
  see the path, and cannot be misread as importance. Signal/noise survives, so
  Analytics copy, the colour palette and the `--viz-*` variables all stay as
  they are. One-word diff per label.
- **Against:** "Sharp Noise" is still a phrase you have to meet once. It says
  *known but not worth much*, which is right, but it is not self-evident on
  first read.

### Option C — drop the jargon entirely

| enum value | proposed |
|---|---|
| `strong_signal` | **High value · know how** |
| `weak_signal` | **High value · unsure how** |
| `strong_noise` | **Low value · know how** |
| `weak_noise` | **Low value · unsure how** |

- **For:** nothing to learn. Both axes are stated outright, so the question
  "where does this go?" answers itself.
- **Against:** long for a badge and a select. Breaks the signal/noise framing
  that the Analytics page is built around — "Signal quality" and
  `signal ÷ (signal + noise)` would need rewording too, and the `--viz-strong-signal`
  CSS variables would no longer match anything on screen.

**Recommendation: B, plus all of Phase 1 below.** Phase 1 is what actually
removes the hesitation; B stops the badge from misleading once the picker is
out of sight. C is the honest choice if you would rather abandon the
signal/noise vocabulary altogether — worth deciding deliberately, not by
default.

---

## 3. Phases

### Phase 1 — make the choice explain itself *(the real fix)*

Replace the bare `<select>` with a picker that shows both axes at once.

```
Category
                    do I know how to start?
                 ┌───────────────┬───────────────┐
                 │      yes      │      no       │
   ┌─────────────┼───────────────┼───────────────┤
   │  worth      │    Sharp      │    Fuzzy      │
 i │  my week    │    Signal     │    Signal     │
 s │             │   do first    │   do second   │
   ├─────────────┼───────────────┼───────────────┤
 i │  not        │    Sharp      │    Fuzzy      │
 t │  really     │    Noise      │    Noise      │
   │             │    limit      │   eliminate   │
   └─────────────┴───────────────┴───────────────┘

        [ Personal ] — fixed cost, off the grid
```

- A 2×2 grid of buttons, colour-coded with the existing palette, plus Personal
  as a fifth control below it. Selected state = filled; the rest outlined.
- Each cell carries its `priority` verb (`do first` / `do second` / `limit` /
  `eliminate`) as a second line. That verb is the thing that makes the choice
  actionable, and it is currently invisible.
- Row and column headers state the two axes in plain words. This is what stops
  the guessing — you pick a row, then a column.
- On a phone, collapse to a single column of five buttons, each with its
  description inline. Do not fall back to the `<select>`; the description is
  the point.

Touches: `CreateSprintForm.tsx` (one site), `TasksEditor.tsx` (two sites) —
extract a shared `CategoryPicker` in `components/sprint/` so there is one
implementation rather than three.

### Phase 2 — apply the rename

One edit to `label` in `TASK_CATEGORIES`, assuming Option B. Then:

- Point `SignalMeter.tsx`'s `SEGMENTS` at `TASK_CATEGORIES` instead of its
  hardcoded strings, so this cannot drift again. `untagged` stays local.
- `AnalyticsCharts.tsx` (lines 87–91) holds a *third* hardcoded copy of the
  same five labels. Point it at `TASK_CATEGORIES` too.
- The AI prompts are safe: `lib/ai/prompts.ts` mentions "Signal vs noise ratio"
  once (line 99) and never names a specific category, so no prompt asks the
  model for a label the UI would stop showing.
- Leave `lib/gamification.ts` alone. Its `LEVEL_TITLES` are deliberately a
  different vocabulary; Option B is chosen precisely so the two stop
  overlapping.

### Phase 3 — consistency and cleanup

- Make both `TasksEditor` pickers identical (falls out of Phase 1).
- Delete the `emoji` field from `TASK_CATEGORIES` once its one call site is
  gone, or keep it and use `CATEGORY_DOT_CLASSES` everywhere instead. Either
  way, stop mixing the two.
- Add a compact legend to the Analytics page under "Signal quality", so the
  percentage is interpretable without going to a sprint to remember the words.
- After Phases 2–3 there should be exactly one place a category label is
  written down. Today there are four: `constants.ts`, `SignalMeter.tsx`,
  `AnalyticsCharts.tsx`, and the emoji at `TasksEditor.tsx:269`.

### Phase 4 — optional, only if the confusion survives Phase 1

- **Two-question fallback.** A "not sure?" link that asks *Is this worth your
  week?* then *Do you know how to start?* and selects the quadrant for you.
- **Examples on hover.** One concrete example per quadrant, drawn from your own
  most-used task names rather than invented ones.
- **Retro nudge.** In the week summary, surface tasks tagged Clear Noise that
  ate more than N hours — the category earns its keep by being acted on, not
  just recorded.

---

## 4. Open decisions

1. **Which naming option** — A, B or C. Everything else is mechanical. If B,
   confirm sharp/fuzzy reads right to you, since clear/fuzzy is off the table.
2. **Whether Analytics keeps the signal/noise vocabulary.** Only forced if you
   pick C, but worth answering deliberately either way.
3. **Whether `personal` belongs in the same control at all.** It is not a point
   on the value/clarity grid — it is a fixed cost you are choosing to protect.
   Phase 1 puts it beside the grid rather than inside it; confirm that reads
   right.
4. **Phase 4 or not.** Cheap to skip, cheap to add later; no point building the
   guided flow before seeing whether the grid alone fixes it.


---

## 5. What was built (2026-08-18)

Option B, plus Phases 1-3. Phase 4 was left alone deliberately: build the
guided flow only if the grid turns out not to be enough.

- **Labels**: Sharp Signal / Fuzzy Signal / Sharp Noise / Fuzzy Noise /
  Personal. Priority verbs became imperatives — `Do first`, `Do second`,
  `Limit`, `Eliminate`, `Protect` — since they are now shown to the user.
- **Picker**: `components/sprint/CategoryPicker.tsx`, a 2x2 with the two
  questions as row and column headings, replacing all three `<select>`s. The
  selected cell's description and an example print underneath — not in every
  cell (a wall) and not on hover (invisible on a phone).
- **Colour now follows the action ladder**, which is the part that had been
  contradicting itself: red sat on `strong_noise` (the quadrant you merely
  *limit*) and purple on `weak_noise` (the one you *eliminate*). Swapped, so
  the escalation runs green → amber → purple → red, with blue off to the side
  for Personal. No new hues were introduced, so the palette keeps its
  validated CVD properties.
- **Palette re-validated** in the new adjacency with the dataviz validator,
  light and dark: all checks pass. Worst adjacent pair is amber↔green,
  ΔE 9.1 protan light / 8.4 dark against a floor of 8; normal-vision 22.9 /
  19.8 against a floor of 15. The contrast WARN on green and amber in light
  mode is relieved by the visible labels the meter and legends already carry.
  `--viz-untagged` stays deliberately achromatic — a "no data" bucket, not a
  sixth category.
- **One source of truth**: `SignalMeter`, `AnalyticsCharts` and the stack
  order all read `TASK_CATEGORIES` / `CATEGORY_ORDER`. The emoji field is
  gone. Four copies of the labels became one.
- **Untouched**: the Postgres enum, and `LEVEL_TITLES` in `lib/gamification.ts`
  — the collision that ruled "Clear Signal" out as a category name.

### Not verified visually

No browser tooling was connected when this was built. It typechecks, lints and
builds; the picker was rendered through `renderToStaticMarkup` to confirm its
structure, headings, selected state and description line. Layout, colour in
situ, and the analytics charts under the swapped palette have not been seen on
screen.
