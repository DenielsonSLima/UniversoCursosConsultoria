ALTER TABLE public.usuarios_sistema
  ADD COLUMN IF NOT EXISTS cpf TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_sistema_cpf_unique_idx
  ON public.usuarios_sistema (regexp_replace(cpf, '\\D', '', 'g'))
  WHERE cpf IS NOT NULL AND btrim(cpf) <> '';
