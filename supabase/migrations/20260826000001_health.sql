-- 20260826000001_health.sql
-- Health & fitness tracking: workouts, water, food and body composition.
--
-- Replaces two external apps (FitNotes for training, FitDays for the scale),
-- so the shapes here are deliberately close to what those export: a workout is
-- a dated session of sets, a set carries whichever of weight/reps/distance/time
-- its exercise `kind` calls for, and a body measurement is one row per day with
-- a wide set of mostly-null scale metrics.
--
-- Personal feature — no reviewer access, simple owner_id = auth.uid() RLS,
-- same as note_pages and the todo tables.

-- ---------------------------------------------------------------------------
-- Profile & goals
-- ---------------------------------------------------------------------------

create table if not exists public.health_profiles (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null unique references public.users(id) on delete cascade,
  height_cm             numeric(5, 1),
  sex                   text check (sex in ('male', 'female', 'other')),
  birth_date            date,
  -- What the numbers are being steered towards. Drives how the AI reads a
  -- weight trend: -0.4 kg/week is progress on a cut and a problem on a bulk.
  goal_type             text not null default 'maintain'
                          check (goal_type in ('cut', 'bulk', 'recomp', 'maintain')),
  target_weight_kg      numeric(5, 2),
  daily_water_ml_goal   integer not null default 3000 check (daily_water_ml_goal > 0),
  daily_kcal_goal       integer check (daily_kcal_goal > 0),
  daily_protein_g_goal  integer check (daily_protein_g_goal > 0),
  weekly_workout_goal   smallint not null default 4 check (weekly_workout_goal between 0 and 14),
  -- Display units only. Everything is stored metric.
  weight_unit           text not null default 'kg' check (weight_unit in ('kg', 'lb')),
  volume_unit           text not null default 'ml' check (volume_unit in ('ml', 'oz')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

drop trigger if exists health_profiles_set_updated_at on public.health_profiles;
create trigger health_profiles_set_updated_at
before update on public.health_profiles
for each row execute function public.set_updated_at();

alter table public.health_profiles enable row level security;

create policy "owner_all_health_profiles" on public.health_profiles
  for all using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Exercise library
--
-- owner_id null = built-in, readable by everyone and writable by nobody;
-- owner_id set = something this user added. A user who logs "Zercher Squat"
-- gets their own row rather than editing the shared catalogue.
-- ---------------------------------------------------------------------------

create table if not exists public.exercises (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references public.users(id) on delete cascade,
  name         text not null,
  muscle_group text not null default 'other',
  equipment    text not null default 'other',
  -- Which fields a set of this exercise fills in. FitNotes' own convention,
  -- kept verbatim so its CSV imports without translation: w=weight, r=reps,
  -- d=distance, t=time. "wr" is weight+reps, "dt" is a timed run.
  kind         text not null default 'wr' check (kind ~ '^[wrdt]{1,4}$'),
  is_archived  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Two partial indexes rather than one: a null owner_id would make the pair
-- (owner_id, name) non-unique for the shared catalogue, since null never
-- equals null.
create unique index if not exists exercises_global_name_key
  on public.exercises (lower(name)) where owner_id is null;
create unique index if not exists exercises_owner_name_key
  on public.exercises (owner_id, lower(name)) where owner_id is not null;
create index if not exists exercises_owner_idx on public.exercises (owner_id);
create index if not exists exercises_muscle_idx on public.exercises (muscle_group);

drop trigger if exists exercises_set_updated_at on public.exercises;
create trigger exercises_set_updated_at
before update on public.exercises
for each row execute function public.set_updated_at();

alter table public.exercises enable row level security;

create policy "read_exercises" on public.exercises
  for select using (owner_id is null or owner_id = (select auth.uid()));
create policy "insert_own_exercises" on public.exercises
  for insert with check (owner_id = (select auth.uid()));
create policy "update_own_exercises" on public.exercises
  for update using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy "delete_own_exercises" on public.exercises
  for delete using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Workouts
-- ---------------------------------------------------------------------------

create table if not exists public.workouts (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.users(id) on delete cascade,
  daily_log_id uuid references public.daily_logs(id) on delete set null,
  log_date     date not null,
  name         text,
  started_at   timestamptz,
  ended_at     timestamptz,
  rpe          smallint check (rpe between 1 and 10),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists workouts_owner_date_idx on public.workouts (owner_id, log_date desc);

drop trigger if exists workouts_set_updated_at on public.workouts;
create trigger workouts_set_updated_at
before update on public.workouts
for each row execute function public.set_updated_at();

alter table public.workouts enable row level security;

create policy "owner_all_workouts" on public.workouts
  for all using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create table if not exists public.workout_sets (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.users(id) on delete cascade,
  workout_id   uuid not null references public.workouts(id) on delete cascade,
  exercise_id  uuid not null references public.exercises(id) on delete restrict,
  position     integer not null default 0,
  weight_kg    numeric(6, 2),
  reps         smallint check (reps >= 0),
  distance_m   numeric(9, 2),
  duration_sec integer check (duration_sec >= 0),
  -- Warm-ups still belong in the log, but they must not count towards volume
  -- or beat a PR, so every aggregate filters on this.
  is_warmup    boolean not null default false,
  rpe          smallint check (rpe between 1 and 10),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists workout_sets_workout_idx  on public.workout_sets (workout_id, position);
create index if not exists workout_sets_exercise_idx on public.workout_sets (owner_id, exercise_id);

drop trigger if exists workout_sets_set_updated_at on public.workout_sets;
create trigger workout_sets_set_updated_at
before update on public.workout_sets
for each row execute function public.set_updated_at();

alter table public.workout_sets enable row level security;

create policy "owner_all_workout_sets" on public.workout_sets
  for all using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Body composition
--
-- One row per day: a scale read twice in a morning should correct the day's
-- number, not add a second point to the trend line.
-- ---------------------------------------------------------------------------

create table if not exists public.body_metrics (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references public.users(id) on delete cascade,
  measured_on           date not null,
  weight_kg             numeric(5, 2),
  body_fat_pct          numeric(4, 1),
  muscle_mass_kg        numeric(5, 2),
  water_pct             numeric(4, 1),
  bone_mass_kg          numeric(4, 2),
  visceral_fat          numeric(4, 1),
  bmi                   numeric(4, 1),
  bmr                   integer,
  protein_pct           numeric(4, 1),
  subcutaneous_fat_pct  numeric(4, 1),
  skeletal_muscle_pct   numeric(4, 1),
  metabolic_age         smallint,
  waist_cm              numeric(5, 1),
  chest_cm              numeric(5, 1),
  arm_cm                numeric(5, 1),
  thigh_cm              numeric(5, 1),
  hip_cm                numeric(5, 1),
  neck_cm               numeric(5, 1),
  notes                 text,
  source                text not null default 'manual' check (source in ('manual', 'import')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint body_metrics_owner_date_unique unique (owner_id, measured_on)
);

create index if not exists body_metrics_owner_date_idx on public.body_metrics (owner_id, measured_on desc);

drop trigger if exists body_metrics_set_updated_at on public.body_metrics;
create trigger body_metrics_set_updated_at
before update on public.body_metrics
for each row execute function public.set_updated_at();

alter table public.body_metrics enable row level security;

create policy "owner_all_body_metrics" on public.body_metrics
  for all using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Water
--
-- One row per sip rather than a running daily total, so the last tap can be
-- undone without recomputing anything, and so timing is available later.
-- ---------------------------------------------------------------------------

create table if not exists public.water_logs (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references public.users(id) on delete cascade,
  log_date   date not null,
  amount_ml  integer not null check (amount_ml > 0 and amount_ml <= 5000),
  logged_at  timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists water_logs_owner_date_idx on public.water_logs (owner_id, log_date);

alter table public.water_logs enable row level security;

create policy "owner_all_water_logs" on public.water_logs
  for all using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Food
--
-- `foods` is a personal library, not a public database: whatever the AI
-- estimated (or the user corrected) the first time is what gets reused, so the
-- second serving of "amma's sambar" needs no parse and no guesswork.
-- ---------------------------------------------------------------------------

create table if not exists public.foods (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.users(id) on delete cascade,
  name         text not null,
  brand        text,
  serving_qty  numeric(8, 2) not null default 1,
  serving_unit text not null default 'serving',
  kcal         numeric(7, 1) not null default 0,
  protein_g    numeric(6, 1) not null default 0,
  carbs_g      numeric(6, 1) not null default 0,
  fat_g        numeric(6, 1) not null default 0,
  fiber_g      numeric(6, 1) not null default 0,
  is_favorite  boolean not null default false,
  source       text not null default 'manual' check (source in ('manual', 'ai', 'import')),
  times_used   integer not null default 0,
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists foods_owner_name_key
  on public.foods (owner_id, lower(name), lower(coalesce(brand, '')));
create index if not exists foods_owner_recent_idx on public.foods (owner_id, last_used_at desc nulls last);

drop trigger if exists foods_set_updated_at on public.foods;
create trigger foods_set_updated_at
before update on public.foods
for each row execute function public.set_updated_at();

alter table public.foods enable row level security;

create policy "owner_all_foods" on public.foods
  for all using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create table if not exists public.meals (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.users(id) on delete cascade,
  log_date      date,
  meal_type     text not null default 'snack'
                  check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  eaten_at      timestamptz,
  -- What the user actually typed, kept alongside the parsed items so a bad
  -- estimate can be re-parsed later without retyping the meal.
  raw_text      text,
  -- A saved combo ("usual breakfast"). Templates have no log_date and never
  -- count towards a day's totals; logging one copies its items into a new meal.
  is_template   boolean not null default false,
  template_name text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint meals_template_shape check (
    (is_template and template_name is not null and log_date is null)
    or (not is_template and log_date is not null)
  )
);

create index if not exists meals_owner_date_idx on public.meals (owner_id, log_date);
create index if not exists meals_owner_template_idx on public.meals (owner_id) where is_template;

drop trigger if exists meals_set_updated_at on public.meals;
create trigger meals_set_updated_at
before update on public.meals
for each row execute function public.set_updated_at();

alter table public.meals enable row level security;

create policy "owner_all_meals" on public.meals
  for all using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create table if not exists public.meal_items (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null references public.users(id) on delete cascade,
  meal_id   uuid not null references public.meals(id) on delete cascade,
  -- Nullable on purpose: the macros are copied onto the item, so deleting a
  -- library entry must never rewrite history.
  food_id   uuid references public.foods(id) on delete set null,
  position  integer not null default 0,
  name      text not null,
  qty       numeric(8, 2) not null default 1,
  unit      text not null default 'serving',
  kcal      numeric(7, 1) not null default 0,
  protein_g numeric(6, 1) not null default 0,
  carbs_g   numeric(6, 1) not null default 0,
  fat_g     numeric(6, 1) not null default 0,
  fiber_g   numeric(6, 1) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meal_items_meal_idx on public.meal_items (meal_id, position);

drop trigger if exists meal_items_set_updated_at on public.meal_items;
create trigger meal_items_set_updated_at
before update on public.meal_items
for each row execute function public.set_updated_at();

alter table public.meal_items enable row level security;

create policy "owner_all_meal_items" on public.meal_items
  for all using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Built-in exercise catalogue
--
-- Names follow FitNotes' spelling so an imported CSV matches these rows
-- instead of creating a near-duplicate custom exercise next to each one.
-- ---------------------------------------------------------------------------

insert into public.exercises (owner_id, name, muscle_group, equipment, kind) values
  (null, 'Bench Press', 'chest', 'barbell', 'wr'),
  (null, 'Incline Bench Press', 'chest', 'barbell', 'wr'),
  (null, 'Decline Bench Press', 'chest', 'barbell', 'wr'),
  (null, 'Dumbbell Bench Press', 'chest', 'dumbbell', 'wr'),
  (null, 'Incline Dumbbell Bench Press', 'chest', 'dumbbell', 'wr'),
  (null, 'Dumbbell Fly', 'chest', 'dumbbell', 'wr'),
  (null, 'Cable Crossover', 'chest', 'cable', 'wr'),
  (null, 'Chest Press Machine', 'chest', 'machine', 'wr'),
  (null, 'Pec Deck', 'chest', 'machine', 'wr'),
  (null, 'Push Up', 'chest', 'bodyweight', 'r'),
  (null, 'Dips', 'chest', 'bodyweight', 'wr'),
  (null, 'Deadlift', 'back', 'barbell', 'wr'),
  (null, 'Sumo Deadlift', 'back', 'barbell', 'wr'),
  (null, 'Romanian Deadlift', 'hamstrings', 'barbell', 'wr'),
  (null, 'Rack Pull', 'back', 'barbell', 'wr'),
  (null, 'Barbell Row', 'back', 'barbell', 'wr'),
  (null, 'Pendlay Row', 'back', 'barbell', 'wr'),
  (null, 'T-Bar Row', 'back', 'barbell', 'wr'),
  (null, 'Dumbbell Row', 'back', 'dumbbell', 'wr'),
  (null, 'Seated Cable Row', 'back', 'cable', 'wr'),
  (null, 'Lat Pulldown', 'back', 'cable', 'wr'),
  (null, 'Close Grip Lat Pulldown', 'back', 'cable', 'wr'),
  (null, 'Straight Arm Pulldown', 'back', 'cable', 'wr'),
  (null, 'Pull Up', 'back', 'bodyweight', 'wr'),
  (null, 'Chin Up', 'back', 'bodyweight', 'wr'),
  (null, 'Inverted Row', 'back', 'bodyweight', 'r'),
  (null, 'Face Pull', 'back', 'cable', 'wr'),
  (null, 'Shrug', 'back', 'barbell', 'wr'),
  (null, 'Dumbbell Shrug', 'back', 'dumbbell', 'wr'),
  (null, 'Hyperextension', 'back', 'bodyweight', 'wr'),
  (null, 'Good Morning', 'hamstrings', 'barbell', 'wr'),
  (null, 'Overhead Press', 'shoulders', 'barbell', 'wr'),
  (null, 'Seated Overhead Press', 'shoulders', 'barbell', 'wr'),
  (null, 'Dumbbell Shoulder Press', 'shoulders', 'dumbbell', 'wr'),
  (null, 'Arnold Press', 'shoulders', 'dumbbell', 'wr'),
  (null, 'Push Press', 'shoulders', 'barbell', 'wr'),
  (null, 'Lateral Raise', 'shoulders', 'dumbbell', 'wr'),
  (null, 'Cable Lateral Raise', 'shoulders', 'cable', 'wr'),
  (null, 'Front Raise', 'shoulders', 'dumbbell', 'wr'),
  (null, 'Rear Delt Fly', 'shoulders', 'dumbbell', 'wr'),
  (null, 'Reverse Pec Deck', 'shoulders', 'machine', 'wr'),
  (null, 'Upright Row', 'shoulders', 'barbell', 'wr'),
  (null, 'Squat', 'quads', 'barbell', 'wr'),
  (null, 'Front Squat', 'quads', 'barbell', 'wr'),
  (null, 'Hack Squat', 'quads', 'machine', 'wr'),
  (null, 'Goblet Squat', 'quads', 'dumbbell', 'wr'),
  (null, 'Bulgarian Split Squat', 'quads', 'dumbbell', 'wr'),
  (null, 'Leg Press', 'quads', 'machine', 'wr'),
  (null, 'Leg Extension', 'quads', 'machine', 'wr'),
  (null, 'Lunge', 'quads', 'dumbbell', 'wr'),
  (null, 'Walking Lunge', 'quads', 'dumbbell', 'wr'),
  (null, 'Step Up', 'quads', 'dumbbell', 'wr'),
  (null, 'Leg Curl', 'hamstrings', 'machine', 'wr'),
  (null, 'Seated Leg Curl', 'hamstrings', 'machine', 'wr'),
  (null, 'Nordic Curl', 'hamstrings', 'bodyweight', 'r'),
  (null, 'Hip Thrust', 'glutes', 'barbell', 'wr'),
  (null, 'Glute Bridge', 'glutes', 'bodyweight', 'wr'),
  (null, 'Cable Kickback', 'glutes', 'cable', 'wr'),
  (null, 'Hip Abduction', 'glutes', 'machine', 'wr'),
  (null, 'Standing Calf Raise', 'calves', 'machine', 'wr'),
  (null, 'Seated Calf Raise', 'calves', 'machine', 'wr'),
  (null, 'Barbell Curl', 'biceps', 'barbell', 'wr'),
  (null, 'EZ Bar Curl', 'biceps', 'barbell', 'wr'),
  (null, 'Dumbbell Curl', 'biceps', 'dumbbell', 'wr'),
  (null, 'Hammer Curl', 'biceps', 'dumbbell', 'wr'),
  (null, 'Incline Dumbbell Curl', 'biceps', 'dumbbell', 'wr'),
  (null, 'Preacher Curl', 'biceps', 'barbell', 'wr'),
  (null, 'Concentration Curl', 'biceps', 'dumbbell', 'wr'),
  (null, 'Cable Curl', 'biceps', 'cable', 'wr'),
  (null, 'Close Grip Bench Press', 'triceps', 'barbell', 'wr'),
  (null, 'Skullcrusher', 'triceps', 'barbell', 'wr'),
  (null, 'Tricep Pushdown', 'triceps', 'cable', 'wr'),
  (null, 'Rope Pushdown', 'triceps', 'cable', 'wr'),
  (null, 'Overhead Tricep Extension', 'triceps', 'dumbbell', 'wr'),
  (null, 'Tricep Kickback', 'triceps', 'dumbbell', 'wr'),
  (null, 'Bench Dip', 'triceps', 'bodyweight', 'r'),
  (null, 'Wrist Curl', 'forearms', 'barbell', 'wr'),
  (null, 'Reverse Wrist Curl', 'forearms', 'barbell', 'wr'),
  (null, 'Farmers Walk', 'forearms', 'dumbbell', 'wt'),
  (null, 'Dead Hang', 'forearms', 'bodyweight', 't'),
  (null, 'Crunch', 'abs', 'bodyweight', 'r'),
  (null, 'Sit Up', 'abs', 'bodyweight', 'r'),
  (null, 'Cable Crunch', 'abs', 'cable', 'wr'),
  (null, 'Hanging Leg Raise', 'abs', 'bodyweight', 'r'),
  (null, 'Lying Leg Raise', 'abs', 'bodyweight', 'r'),
  (null, 'Plank', 'abs', 'bodyweight', 't'),
  (null, 'Side Plank', 'abs', 'bodyweight', 't'),
  (null, 'Russian Twist', 'abs', 'dumbbell', 'wr'),
  (null, 'Ab Wheel Rollout', 'abs', 'other', 'r'),
  (null, 'Mountain Climber', 'abs', 'bodyweight', 'r'),
  (null, 'Kettlebell Swing', 'full body', 'kettlebell', 'wr'),
  (null, 'Clean and Press', 'full body', 'barbell', 'wr'),
  (null, 'Power Clean', 'full body', 'barbell', 'wr'),
  (null, 'Snatch', 'full body', 'barbell', 'wr'),
  (null, 'Thruster', 'full body', 'barbell', 'wr'),
  (null, 'Burpee', 'full body', 'bodyweight', 'r'),
  (null, 'Battle Ropes', 'full body', 'other', 't'),
  (null, 'Sled Push', 'full body', 'other', 'wt'),
  (null, 'Running', 'cardio', 'bodyweight', 'dt'),
  (null, 'Treadmill', 'cardio', 'machine', 'dt'),
  (null, 'Walking', 'cardio', 'bodyweight', 'dt'),
  (null, 'Cycling', 'cardio', 'machine', 'dt'),
  (null, 'Elliptical', 'cardio', 'machine', 'dt'),
  (null, 'Rowing Machine', 'cardio', 'machine', 'dt'),
  (null, 'Stair Climber', 'cardio', 'machine', 'dt'),
  (null, 'Swimming', 'cardio', 'bodyweight', 'dt'),
  (null, 'Jump Rope', 'cardio', 'other', 't'),
  (null, 'Stationary Bike', 'cardio', 'machine', 'dt'),
  (null, 'Yoga', 'mobility', 'bodyweight', 't'),
  (null, 'Stretching', 'mobility', 'bodyweight', 't'),
  (null, 'Foam Rolling', 'mobility', 'other', 't')
on conflict do nothing;
