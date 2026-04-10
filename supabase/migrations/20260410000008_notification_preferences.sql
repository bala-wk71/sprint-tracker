-- 008_notification_preferences.sql
-- Per-user notification settings. One row per user, created lazily.

create table if not exists public.notification_preferences (
  user_id              uuid primary key references public.users(id) on delete cascade,
  morning_reminder     boolean not null default true,
  evening_reminder     boolean not null default true,
  weekly_summary       boolean not null default true,
  reviewer_comments    boolean not null default true,
  reminder_time_morning time not null default '08:00',
  reminder_time_evening time not null default '20:00',
  timezone             text not null default 'UTC',
  updated_at           timestamptz not null default now()
);

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;
