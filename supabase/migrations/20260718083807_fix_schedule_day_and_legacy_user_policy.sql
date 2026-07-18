BEGIN;

ALTER TABLE public.perfis_acesso DROP CONSTRAINT IF EXISTS perfis_acesso_restricao_shape;
ALTER TABLE public.perfis_acesso ADD CONSTRAINT perfis_acesso_restricao_shape CHECK (
  jsonb_typeof(restricao_horario) = 'object'
  AND jsonb_typeof(restricao_horario -> 'ativo') = 'boolean'
  AND jsonb_typeof(restricao_horario -> 'dias') = 'array'
  AND (restricao_horario ->> 'horario_inicio') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND (restricao_horario ->> 'horario_fim') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  AND (
    coalesce((restricao_horario ->> 'ativo')::boolean, false) = false
    OR (
      jsonb_array_length(restricao_horario -> 'dias') > 0
      AND (restricao_horario ->> 'horario_inicio') <> (restricao_horario ->> 'horario_fim')
    )
  )
  AND (restricao_horario -> 'dias') <@ '[0,1,2,3,4,5,6]'::jsonb
);

ALTER TABLE public.usuarios_sistema DROP CONSTRAINT IF EXISTS usuarios_sistema_restricao_shape;
ALTER TABLE public.usuarios_sistema ADD CONSTRAINT usuarios_sistema_restricao_shape CHECK (
  restricao_horario IS NULL OR (
    jsonb_typeof(restricao_horario) = 'object'
    AND jsonb_typeof(restricao_horario -> 'ativo') = 'boolean'
    AND jsonb_typeof(restricao_horario -> 'dias') = 'array'
    AND (restricao_horario ->> 'horario_inicio') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND (restricao_horario ->> 'horario_fim') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND (
      coalesce((restricao_horario ->> 'ativo')::boolean, false) = false
      OR (
        jsonb_array_length(restricao_horario -> 'dias') > 0
        AND (restricao_horario ->> 'horario_inicio') <> (restricao_horario ->> 'horario_fim')
      )
    )
    AND (restricao_horario -> 'dias') <@ '[0,1,2,3,4,5,6]'::jsonb
  )
);

CREATE OR REPLACE FUNCTION public.gestor_schedule_allows_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH schedule AS (
    SELECT public.gestor_effective_schedule() AS value
  ), zoned AS (
    SELECT
      value,
      extract(dow FROM (now() AT TIME ZONE 'America/Maceio'))::integer AS current_day,
      to_char((now() AT TIME ZONE 'America/Maceio'), 'HH24:MI') AS access_time
    FROM schedule
  ), normalized AS (
    SELECT
      value,
      current_day,
      access_time,
      value ->> 'horario_inicio' AS start_time,
      value ->> 'horario_fim' AS end_time
    FROM zoned
  )
  SELECT CASE
    WHEN value IS NULL THEN false
    WHEN jsonb_typeof(value -> 'ativo') <> 'boolean' THEN false
    WHEN NOT (value ->> 'ativo')::boolean THEN true
    WHEN jsonb_typeof(value -> 'dias') <> 'array' THEN false
    WHEN start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN false
    WHEN end_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN false
    WHEN start_time = end_time THEN false
    WHEN start_time < end_time THEN
      access_time BETWEEN start_time AND end_time
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(value -> 'dias') allowed_day(value)
        WHERE allowed_day.value::integer = current_day
      )
    WHEN access_time >= start_time THEN EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(value -> 'dias') allowed_day(value)
      WHERE allowed_day.value::integer = current_day
    )
    WHEN access_time <= end_time THEN EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(value -> 'dias') allowed_day(value)
      WHERE allowed_day.value::integer = ((current_day + 6) % 7)
    )
    ELSE false
  END
  FROM normalized;
$$;

DROP POLICY IF EXISTS portal_usuarios_sistema_write_global ON public.usuarios_sistema;

COMMIT;
