-- Garante também os dígitos verificadores do CPF em qualquer caminho de escrita,
-- inclusive integrações que não passam pelos validadores do frontend.
CREATE OR REPLACE FUNCTION public.is_valid_cpf(value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  digits text := pg_catalog.regexp_replace(value, '\D', '', 'g');
  sum_value integer;
  remainder integer;
  first_digit integer;
  second_digit integer;
BEGIN
  IF digits !~ '^[0-9]{11}$' OR digits ~ '^([0-9])\1{10}$' THEN
    RETURN false;
  END IF;

  sum_value := 0;
  FOR digit_index IN 1..9 LOOP
    sum_value := sum_value
      + pg_catalog.substr(digits, digit_index, 1)::integer * (11 - digit_index);
  END LOOP;
  remainder := 11 - (sum_value % 11);
  first_digit := CASE WHEN remainder >= 10 THEN 0 ELSE remainder END;

  IF first_digit <> pg_catalog.substr(digits, 10, 1)::integer THEN
    RETURN false;
  END IF;

  sum_value := 0;
  FOR digit_index IN 1..10 LOOP
    sum_value := sum_value
      + pg_catalog.substr(digits, digit_index, 1)::integer * (12 - digit_index);
  END LOOP;
  remainder := 11 - (sum_value % 11);
  second_digit := CASE WHEN remainder >= 10 THEN 0 ELSE remainder END;

  RETURN second_digit = pg_catalog.substr(digits, 11, 1)::integer;
END;
$$;

REVOKE ALL ON FUNCTION public.is_valid_cpf(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_cpf(text) TO anon, authenticated, service_role;

ALTER TABLE public.parceiros
  DROP CONSTRAINT IF EXISTS parceiros_aluno_cpf_required;

ALTER TABLE public.parceiros
  ADD CONSTRAINT parceiros_aluno_cpf_required
  CHECK (
    upper(coalesce(tipo, '')) <> 'ALUNO'
    OR public.is_valid_cpf(cpf_cnpj)
  ) NOT VALID;

ALTER TABLE public.parceiros
  VALIDATE CONSTRAINT parceiros_aluno_cpf_required;
