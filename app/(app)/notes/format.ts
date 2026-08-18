/**
 * "Aug 18, 2026" from an ISO date, or null.
 *
 * Formatted in UTC deliberately. `meeting_date` is a calendar day, not an
 * instant; parsing it as local time puts a sitting on the 17th for anyone west
 * of Greenwich, and this runs on both the server and the client.
 */
export function formatMeetingDate(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
