import { CalendarClock, FileText, Repeat } from "lucide-react";
import type { NoteKind } from "./types";

export { formatMeetingDate } from "./format";

/** One place deciding how each kind reads, so nothing drifts. */
export const KIND_META: Record<NoteKind, { label: string; plural: string }> = {
  page: { label: "Page", plural: "Pages" },
  series: { label: "Series", plural: "Series" },
  meeting: { label: "Meeting", plural: "Meetings" },
};

/**
 * Written as a switch rather than a lookup returning a component, because a
 * component pulled out of a map during render is a *new* component each pass
 * as far as React is concerned, and remounts on every re-render.
 */
export function KindIcon({
  kind,
  className,
}: {
  kind: NoteKind;
  className?: string;
}) {
  if (kind === "series") return <Repeat className={className} />;
  if (kind === "meeting") return <CalendarClock className={className} />;
  return <FileText className={className} />;
}
