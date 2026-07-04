BEGIN;

ALTER TABLE public.turmas
  DROP CONSTRAINT IF EXISTS turmas_turno_check;

ALTER TABLE public.turmas
  ADD CONSTRAINT turmas_turno_check
  CHECK (turno IN ('MATUTINO', 'VESPERTINO', 'NOTURNO', 'INTEGRAL', 'EAD'));

COMMIT;
