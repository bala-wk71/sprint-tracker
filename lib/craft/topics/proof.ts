import type { Track } from "../types";

export const proofTrack: Track = {
  slug: "proof",
  title: "Proof",
  blurb:
    "Confidence is not evidence. This track is about the two things that turn \"it seems to work\" into something you can defend: tests that are worth their maintenance cost, and review conversations that actually transfer judgment.",
  topics: [
    {
      slug: "testing-strategy",
      title: "What to test, and at which level",
      hook: "Most bad test suites are not under-tested. They are tested at the wrong level, and the cost shows up as fear of changing anything.",
      minutes: 7,
      idea: [
        "A test earns its keep by catching a real bug more often than it costs you in maintenance. That framing settles most arguments, because it says immediately that 100% coverage is not a goal — a test of a getter costs maintenance and catches nothing.",
        "",
        "The levels, and what each is genuinely for:",
        "",
        "- **Unit tests** — one piece of logic, no I/O. Fast, precise, and the right home for anything with branches: date maths, pricing, state machines, parsers, permission rules. This is where the bugs that are hard to reason about live.",
        "- **Integration tests** — real database, real queries. The right home for anything where the question is \"does this actually work against the real thing\": RLS policies, constraints, migrations, transactions. A mocked database tests your mock.",
        "- **End-to-end tests** — a browser doing what a user does. Slow, flaky, expensive. Worth it for a handful of flows you cannot afford to break: sign in, pay, the one thing your product is for.",
        "",
        "The classic mistake is inverting the pyramid — a hundred slow, brittle E2E tests and no unit tests — which produces a suite that takes twenty minutes, fails randomly, and gets ignored.",
        "",
        "**Test behaviour, not implementation.** A test that breaks when you rename a private function is a test that punishes refactoring. A test that breaks when the output changes is doing its job. The rule of thumb: if you can rewrite the internals entirely and the tests still pass, they were testing the right thing.",
        "",
        "**Test the edges, not the middle.** Empty, one, many. Null. Duplicate. Boundary values. Wrong type. The failure path. The happy path is the case least likely to be broken and the one everyone writes first.",
        "",
        "And the discipline that matters most in practice: **when you fix a bug, write the test that would have caught it, first.** Watch it fail, then fix it. That one habit is where a suite that is actually worth having comes from — every test in it corresponds to a real failure.",
      ].join("\n"),
      bites: [
        "It bites as a codebase nobody will refactor, because nothing proves a change is safe. That fear compounds: the code gets worse because improving it is risky, which makes it riskier.",
        "",
        "It bites the other way as a suite that is all mocks — green forever, catching nothing, and giving a confident signal that is not connected to reality.",
      ].join("\n"),
      decisions: [
        "What could actually break here, and at what level would that be caught?",
        "Is this test coupled to behaviour or to implementation details?",
        "Is a real database needed here, or is this pure logic?",
        "Does this test earn its maintenance cost, or am I writing it for the coverage number?",
        "Did I write the failing test before the fix?",
      ],
      inYourCode: [
        "Find your most complex pure function — date or week-start maths is a good candidate — and check whether it has unit tests for the boundaries.",
        "Pick one RLS policy and ask what test proves it works. If the answer is \"none\", that is a security rule with no evidence behind it.",
        "Next bug you fix, write the failing test first. Notice how much it clarifies the bug.",
      ],
      gotIt: [
        "You can say which level a given risk belongs at, without debate.",
        "You refactor freely in the areas that are tested, and cautiously where they are not — and you know which is which.",
      ],
      deeper: [
        {
          label: "Testing Trophy / Write tests. Not too many. Mostly integration. — Kent C. Dodds",
          url: "https://kentcdodds.com/blog/write-tests",
        },
        { label: "Working Effectively with Legacy Code — Feathers, on seams and characterization tests" },
      ],
    },
    {
      slug: "testable-code",
      title: "Why your code is hard to test",
      hook: "\"This is hard to test\" is almost never a testing problem. It is the design telling you something.",
      minutes: 5,
      idea: [
        "When a function is painful to test, the pain is diagnostic. The usual causes, and what each is telling you:",
        "",
        "- **It reaches out for its dependencies** — constructs its own client, reads the clock, calls `fetch` directly. You cannot substitute what you did not receive. Pass dependencies in.",
        "- **It mixes decisions with effects.** The hard-to-test part is the branching logic; the easy part is the write. Separate them: a pure function that decides, a thin shell that acts. Your pace and streak calculations are already shaped this way — the logic is pure and the persistence is elsewhere, which is exactly why they can be tested at all.",
        "- **It depends on now.** `new Date()` inside a function makes its behaviour untestable and time-dependent. Take the date as an argument. Your own codebase does this with `todayIsoLocal()` passed down rather than called deep inside, and that is not an accident.",
        "- **It does five things.** A function with five responsibilities needs its setup multiplied five ways. Split it.",
        "",
        "The general principle is **functional core, imperative shell**: push the decisions into pure functions that take data and return data, and keep the I/O in a thin layer around them. The core is trivially testable, and the shell has little enough logic that integration tests cover it.",
        "",
        "On mocks, one rule saves a lot of pain: **mock at the boundary you own, and do not mock what you do not understand.** Mocking your own repository is fine. Mocking a third-party SDK's internals means your tests encode your guess about how that SDK behaves, and your guess is what was wrong in the first place.",
      ].join("\n"),
      bites: [
        "It bites as tests that take longer to write than the feature, and as the resulting decision not to write them. Then as production bugs in logic that was never exercised anywhere.",
        "",
        "It bites as tests full of elaborate setup, which are themselves a source of bugs and a wall against ever changing the code they cover.",
      ].join("\n"),
      decisions: [
        "Is this function deciding, acting, or both? Split it if both.",
        "Does this reach for a dependency it should be handed?",
        "Does this depend on the current time, and could the time be a parameter?",
        "Am I mocking a boundary I own, or guessing at someone else's behaviour?",
      ],
      inYourCode: [
        "Find a server action with real branching logic. Extract the decision into a pure function and test it.",
        "Search for `new Date()` inside logic rather than at the edge. Each one is a testability problem.",
        "Look at how your timer engine separates pure state transitions from the React provider. That split is the pattern.",
      ],
      gotIt: [
        "\"Hard to test\" reads to you as a design smell, not a testing chore.",
        "You instinctively separate the part that decides from the part that writes.",
      ],
      deeper: [
        {
          label: "Functional core, imperative shell — Gary Bernhardt",
          url: "https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell",
        },
      ],
    },
    {
      slug: "code-review",
      title: "Getting the most out of review",
      hook: "Review is the highest-bandwidth channel you have to your lead's judgment. Most people use maybe a tenth of it.",
      minutes: 5,
      idea: [
        "Review is usually treated as a gate: submit, wait, address comments, merge. Treated as a gate it transfers almost nothing. Treated as a conversation it is the fastest way to acquire someone else's model of the system.",
        "",
        "**Make the diff reviewable.** A reviewer's attention is a fixed budget, and a 900-line diff spends it all on navigation. Small, single-purpose pull requests get real scrutiny; large ones get approved on trust — which means you lose the review, even though you got the approval.",
        "",
        "**Write the description for the reviewer, not the changelog.** What problem, what approach, what you considered and rejected, what you are unsure about. That last one is the highest-value sentence in any pull request: \"I wasn't sure whether this needed a transaction\" gets you a precise answer about exactly the thing you did not know.",
        "",
        "**Review your own diff first, cold.** You will find a third of the comments yourself. Reading your own change as a stranger is a skill, and it is the same skill you need for reading generated code.",
        "",
        "**Treat every comment as information, including the ones that sting.** The question to ask is not \"is this fair\" but \"what does she know that made her look there?\" A reviewer who flags a missing index is showing you her checklist. Write it down. Over a few months, a list of what your lead consistently catches becomes a remarkably accurate map of your gap — and it is a map you can only get this way.",
        "",
        "**Ask why, not just what.** \"Changed, thanks\" closes the thread and teaches you nothing. \"What would have gone wrong if I left it?\" costs her one sentence and gives you the principle rather than the instance.",
        "",
        "And read her reviews of other people. It is free, nobody does it, and the questions she asks repeatedly are the questions you should be asking yourself before you ever open a pull request.",
      ].join("\n"),
      bites: [
        "Skipping it bites as a year spent receiving corrections without ever extracting the rule behind them, so the same class of comment keeps arriving in new clothes.",
        "",
        "It bites as large diffs that were approved rather than reviewed, whose bugs reach production with two names attached instead of one.",
      ].join("\n"),
      decisions: [
        "Is this diff small enough for someone to review properly, or only to approve?",
        "Have I said what I am unsure about? That is where the value is.",
        "Did I read my own diff cold before sending it?",
        "Do I understand the principle behind this comment, or only the fix?",
      ],
      inYourCode: [
        "Start a running note of every comment your lead makes. Group them after a month — the clusters are your syllabus.",
        "On your next pull request, add one line naming what you were unsure about.",
        "Read two of her reviews on someone else's work this week and note the questions she asks.",
      ],
      gotIt: [
        "Your pull requests get questions about approach rather than corrections of detail.",
        "You can predict her comments before she makes them, and you preempt most of them.",
      ],
      deeper: [
        {
          label: "Google's Code Review Developer Guide",
          url: "https://google.github.io/eng-practices/review/",
        },
      ],
    },
  ],
};
