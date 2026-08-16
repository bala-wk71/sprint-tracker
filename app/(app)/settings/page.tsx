import Link from "next/link";
import { createClient, getUser } from "@/lib/supabase/server";
import { currentWeekStart } from "@/lib/dates";
import { toWeekStartDay } from "@/lib/week";
import { ExportForm } from "./ExportForm";
import { PreferencesForm } from "./PreferencesForm";

const SECTIONS = [
  {
    href: "/settings/access",
    title: "Access",
    description:
      "Invite reviewers, manage who can see your sprints, and accept invites to review others.",
  },
];

export default async function SettingsPage() {
  const user = await getUser();
  const supabase = await createClient();

  const { data: profile } = user
    ? await supabase
        .from("users")
        .select("week_start_day, todo_auto_archive")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">
          Profile, notifications, and access management.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-xl border border-border bg-card p-4 sm:p-6 transition-colors hover:border-primary"
          >
            <h2 className="text-lg font-semibold text-foreground">
              {section.title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {section.description}
            </p>
          </Link>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="mb-1 text-lg font-semibold text-foreground">
          Preferences
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          How your weeks are cut, and what happens to finished todo sections.
        </p>
        <PreferencesForm
          weekStartDay={toWeekStartDay(profile?.week_start_day)}
          todoAutoArchive={profile?.todo_auto_archive ?? true}
        />
      </section>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <h2 className="mb-1 text-lg font-semibold text-foreground">
          Export data
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Download your sprint logs and time entries as a CSV file.
        </p>
        <ExportForm defaultFrom={await currentWeekStart()} />
      </section>
    </div>
  );
}
