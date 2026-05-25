-- Add AI persona preference to users
CREATE TYPE ai_persona_type AS ENUM ('drill_sergeant', 'nurturer', 'nietzsche', 'rational');

ALTER TABLE public.users
  ADD COLUMN ai_persona ai_persona_type NOT NULL DEFAULT 'rational';
