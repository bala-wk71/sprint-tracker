-- 20261013000001_money.sql
-- Money: spending and budgets.
--
-- Transactions arrive two ways: typed in by hand, or synced from the Cashew
-- app's CSV export (shared to the installed app, or uploaded). Cashew has no
-- API and keeps its Drive files where only its own app can read them, so the
-- export is the only door.
--
-- Money is owner-only. A reviewer sees sprints and logs, never spending, so
-- there is deliberately no reviewer policy on either table.

create table if not exists public.money_transactions (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.users(id) on delete cascade,
  txn_date     date not null,
  -- Always positive; is_income says which way the money moved.
  amount       numeric(14, 2) not null check (amount > 0),
  is_income    boolean not null default false,
  category     text not null default 'Uncategorised' check (char_length(category) between 1 and 80),
  title        text not null default '' check (char_length(title) <= 200),
  note         text not null default '' check (char_length(note) <= 1000),
  account      text not null default '' check (char_length(account) <= 80),
  currency     text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  source       text not null default 'manual' check (source in ('manual', 'cashew')),
  -- Stable identity of a synced row, so re-sharing the same export adds
  -- nothing. Null for manual rows (nulls never collide in a unique index).
  external_key text check (char_length(external_key) <= 400),
  created_at   timestamptz not null default now()
);

create unique index if not exists money_transactions_owner_key_idx
  on public.money_transactions (owner_id, external_key);
create index if not exists money_transactions_owner_date_idx
  on public.money_transactions (owner_id, txn_date desc, created_at desc);

alter table public.money_transactions enable row level security;

drop policy if exists "money_transactions owner all" on public.money_transactions;
create policy "money_transactions owner all"
  on public.money_transactions for all
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- One monthly limit per category. The category '*' is the limit for the
-- whole month across every category.
create table if not exists public.money_budgets (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.users(id) on delete cascade,
  category      text not null check (char_length(category) between 1 and 80),
  monthly_limit numeric(14, 2) not null check (monthly_limit > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_id, category)
);

drop trigger if exists money_budgets_set_updated_at on public.money_budgets;
create trigger money_budgets_set_updated_at
before update on public.money_budgets
for each row execute function public.set_updated_at();

alter table public.money_budgets enable row level security;

drop policy if exists "money_budgets owner all" on public.money_budgets;
create policy "money_budgets owner all"
  on public.money_budgets for all
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
