import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { format, startOfWeek } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { createClient, getUser } from "@/lib/supabase/server";
import { WeekSummary } from "@/components/dashboard/WeekSummary";
import { WeekNav } from "@/app/(app)/dashboard/WeekNav";

type SearchParams = Promise<{ week?: string }>;
type RouteParams = Promise<{ ownerId: string }>;

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function mondayIsoOf(date: Date): string {
  return format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export default async function ReviewOwnerPage({
  params,
  searchParams,
}: {
  params: RouteParams;
  searchParams: SearchParams;
}) {
  const { ownerId } = await params;
  const sp = await searchParams;

  const supabase = await createClient();
  const user = await getUser();
  if (!user) return null;

  // Verify the relationship — the viewer must be a reviewer of this owner.
  // RLS would already block reads, but we want a clean 404 instead of an
  // empty page if the URL was guessed or the relationship was revoked.
  const { data: relationship } = await supabase
    .from("reviewer_relationships")
    .select(
      "owner_id, created_at, owner:users!reviewer_relationships_owner_id_fkey(id, full_name, email, avatar_url)"
    )
    .eq("reviewer_id", user.id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (!relationship) {
    notFound();
  }

  const owner = relationship.owner as {
    id: string;
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
  const ownerName = owner?.full_name || owner?.email || "Owner";
  const initials = ownerName
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const currentWeekStart = mondayIsoOf(new Date());
  const weekStart =
    sp.week && isValidIsoDate(sp.week)
      ? mondayIsoOf(new Date(`${sp.week}T00:00:00`))
      : currentWeekStart;

  const basePath = `/review/${ownerId}`;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/review"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to all reviewees
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {owner?.avatar_url ? (
            <Image
              src={owner.avatar_url}
              alt={ownerName}
              width={48}
              height={48}
              className="h-12 w-12 rounded-full"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
              {initials || "?"}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-foreground">{ownerName}</h1>
            <p className="text-sm text-muted-foreground">
              Read-only review view ·{" "}
              {owner?.full_name && owner.email ? owner.email : null}
            </p>
          </div>
        </div>
        <WeekNav
          weekStart={weekStart}
          currentWeekStart={currentWeekStart}
          basePath={basePath}
        />
      </div>

      <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-2 text-xs text-primary">
        Private notes, reflections, and gratitude entries are hidden from
        reviewers.
      </div>

      <WeekSummary
        ownerId={ownerId}
        weekStart={weekStart}
        readOnly
        revalidatePath={basePath}
      />
    </div>
  );
}
