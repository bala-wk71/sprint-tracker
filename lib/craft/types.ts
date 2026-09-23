/**
 * The foundations curriculum — things you read once to get the shape of them,
 * then recognise for the rest of your career.
 *
 * Every topic is written to answer the same four questions, because that is
 * the order you actually need them in: what is this, where does it bite, what
 * will I have to decide, and what does it look like in the code in front of
 * me. The last one is what turns reading into judgment.
 */

export type Topic = {
  /** Stable slug — the key craft_reading rows hang off. Never reuse one. */
  slug: string;
  title: string;
  /** One line on why this earned a place on a twenty-topic list. */
  hook: string;
  /** Honest reading time, in minutes. */
  minutes: number;
  /** The concept itself. Markdown. */
  idea: string;
  /** Where it shows up in real work, and what it costs when you miss it. */
  bites: string;
  /** The judgment calls this topic is really about — the senior/junior gap. */
  decisions: string[];
  /** Concrete things to go and look at in your own codebase, today. */
  inYourCode: string[];
  /** Honest signals that you have it, rather than have read about it. */
  gotIt: string[];
  /** Canonical further reading, for when a topic turns out to be your problem. */
  deeper: { label: string; url?: string }[];
};

export type Track = {
  slug: string;
  title: string;
  blurb: string;
  topics: Topic[];
};
