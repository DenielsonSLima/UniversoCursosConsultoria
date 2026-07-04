BEGIN;

ALTER TABLE public.turmas
  ADD COLUMN IF NOT EXISTS exige_matricula boolean NOT NULL DEFAULT true;

COMMIT;
