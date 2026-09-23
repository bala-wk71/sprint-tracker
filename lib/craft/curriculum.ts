import type { Topic, Track } from "./types";
import { dataTrack } from "./topics/data";
import { interfacesTrack } from "./topics/interfaces";
import { failureTrack } from "./topics/failure";
import { proofTrack } from "./topics/proof";
import { operatingTrack } from "./topics/operating";
import { judgmentTrack } from "./topics/judgment";

export type { Topic, Track };

/**
 * Ordered so each track leans on the one before it: you cannot design an
 * interface without a data model, cannot reason about failure without knowing
 * what a transaction promises, and cannot exercise judgment over any of it
 * until you have the vocabulary. Judgment is last because it is the one that
 * never finishes.
 */
export const TRACKS: Track[] = [
  dataTrack,
  interfacesTrack,
  failureTrack,
  proofTrack,
  operatingTrack,
  judgmentTrack,
];

export const ALL_TOPICS: Topic[] = TRACKS.flatMap((track) => track.topics);

export const TOPIC_COUNT = ALL_TOPICS.length;

const BY_SLUG = new Map(ALL_TOPICS.map((topic) => [topic.slug, topic]));

export function topicBySlug(slug: string): Topic | undefined {
  return BY_SLUG.get(slug);
}

export function trackOf(slug: string): Track | undefined {
  return TRACKS.find((track) => track.topics.some((t) => t.slug === slug));
}

export type ReadingStatus = "unread" | "reading" | "read";

export type ReadingRow = {
  topic_slug: string;
  status: "reading" | "read";
  notes: string | null;
  read_at: string | null;
};

export type ReadingMap = Record<string, ReadingRow>;

export function statusOf(reading: ReadingMap, slug: string): ReadingStatus {
  return reading[slug]?.status ?? "unread";
}

export function readCount(reading: ReadingMap): number {
  return ALL_TOPICS.reduce(
    (n, topic) => (reading[topic.slug]?.status === "read" ? n + 1 : n),
    0
  );
}

export function trackProgress(track: Track, reading: ReadingMap) {
  const done = track.topics.reduce(
    (n, topic) => (reading[topic.slug]?.status === "read" ? n + 1 : n),
    0
  );
  return { done, total: track.topics.length };
}

/**
 * The next thing to read: the topic already in progress if there is one,
 * otherwise the first unread topic in curriculum order. Returns undefined
 * only when everything has been read.
 */
export function nextTopic(reading: ReadingMap): Topic | undefined {
  return (
    ALL_TOPICS.find((topic) => reading[topic.slug]?.status === "reading") ??
    ALL_TOPICS.find((topic) => !reading[topic.slug])
  );
}

/** Total honest reading time left, in minutes. */
export function minutesRemaining(reading: ReadingMap): number {
  return ALL_TOPICS.reduce(
    (sum, topic) => (reading[topic.slug]?.status === "read" ? sum : sum + topic.minutes),
    0
  );
}
