import Link from "next/link";
import Image from "next/image";
import { format } from "date-fns";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

type Owner = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

export default async function ReviewListPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // People who have invited me to review them.
  const { data: relationships } = await supabase
    .from("reviewer_relationships")
    .select(
      "owner_id, created_at, owner:users!reviewer_relationships_owner_id_fkey(id, full_name, email, avatar_url)"
    )
    .eq("reviewer_id", user.id)
    .order("created_at", { ascending: true });

  const owners = (relationships ?? [])
    .map((r) => {
      const owner = r.owner as Owner | null;
      if (!owner) return null;
      return { ...owner, since: r.created_at as string };
    })
    .filter((o): o is Owner & { since: string } => o !== null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reviewing</h1>
        <p className="text-muted-foreground">
          People who&apos;ve invited you to review their sprints.
        </p>
      </div>

      {owners.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            You&apos;re not reviewing anyone yet. When someone invites you as
            their reviewer and you accept the invite, they&apos;ll appear here.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {owners.map((o) => {
            const name = o.full_name || o.email || "Unknown";
            const initials = name
              .split(" ")
              .map((p) => p[0])
              .filter(Boolean)
              .slice(0, 2)
              .join("")
              .toUpperCase();
            return (
              <li key={o.id}>
                <Link
                  href={`/review/${o.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary"
                >
                  {o.avatar_url ? (
                    <Image
                      src={o.avatar_url}
                      alt={name}
                      width={40}
                      height={40}
                      className="h-10 w-10 rounded-full"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
                      {initials || "?"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {name}
                    </p>
                    {o.email && o.full_name && (
                      <p className="truncate text-xs text-muted-foreground">
                        {o.email}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Reviewing since{" "}
                      {format(new Date(o.since), "MMM d, yyyy")}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
