BEGIN;

CREATE TABLE IF NOT EXISTS public.perfis_acesso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  descricao text,
  permissoes jsonb NOT NULL DEFAULT '{"modules":[],"tabs":{},"allPolos":false}'::jsonb,
  restricao_horario jsonb NOT NULL DEFAULT '{"dias":[1,2,3,4,5],"horario_inicio":"08:00","horario_fim":"18:00","ativo":false}'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.usuarios_sistema
  ADD COLUMN IF NOT EXISTS perfil_acesso_id uuid REFERENCES public.perfis_acesso(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS personalizar_permissoes boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS restricao_horario jsonb;

CREATE INDEX IF NOT EXISTS idx_usuarios_sistema_perfil_acesso_id
  ON public.usuarios_sistema (perfil_acesso_id);

ALTER TABLE public.perfis_acesso DROP CONSTRAINT IF EXISTS perfis_acesso_permissoes_shape;
ALTER TABLE public.perfis_acesso ADD CONSTRAINT perfis_acesso_permissoes_shape CHECK (
  jsonb_typeof(permissoes) = 'object'
  AND jsonb_typeof(permissoes -> 'modules') = 'array'
  AND jsonb_array_length(permissoes -> 'modules') > 0
  AND (NOT (permissoes ? 'tabs') OR jsonb_typeof(permissoes -> 'tabs') = 'object')
  AND (NOT (permissoes ? 'financeiroTabs') OR jsonb_typeof(permissoes -> 'financeiroTabs') = 'array')
  AND (NOT (permissoes ? 'allPolos') OR jsonb_typeof(permissoes -> 'allPolos') = 'boolean')
) NOT VALID;
ALTER TABLE public.perfis_acesso VALIDATE CONSTRAINT perfis_acesso_permissoes_shape;

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
) NOT VALID;
ALTER TABLE public.perfis_acesso VALIDATE CONSTRAINT perfis_acesso_restricao_shape;

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
) NOT VALID;
ALTER TABLE public.usuarios_sistema VALIDATE CONSTRAINT usuarios_sistema_restricao_shape;

CREATE OR REPLACE FUNCTION public.gestor_effective_permissions()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_set(
    CASE
      WHEN u.perfil_acesso_id IS NOT NULL
        AND NOT coalesce(u.personalizar_permissoes, false)
        AND p.id IS NOT NULL
        THEN coalesce(p.permissoes, '{}'::jsonb)
      ELSE coalesce(u.permissoes, '{}'::jsonb)
    END,
    '{allPolos}',
    to_jsonb(
      CASE
        WHEN jsonb_typeof(u.permissoes -> 'allPolos') = 'boolean'
          THEN (u.permissoes ->> 'allPolos')::boolean
        ELSE false
      END
    ),
    true
  )
  FROM public.usuarios_sistema u
  LEFT JOIN public.perfis_acesso p ON p.id = u.perfil_acesso_id
  WHERE lower(u.email) = public.auth_email()
    AND public.is_active_status(u.status)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.gestor_effective_schedule()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    u.restricao_horario,
    CASE WHEN u.perfil_acesso_id IS NOT NULL THEN p.restricao_horario ELSE NULL END,
    '{"ativo":false,"dias":[1,2,3,4,5,6],"horario_inicio":"00:00","horario_fim":"23:59"}'::jsonb
  )
  FROM public.usuarios_sistema u
  LEFT JOIN public.perfis_acesso p ON p.id = u.perfil_acesso_id
  WHERE lower(u.email) = public.auth_email()
    AND public.is_active_status(u.status)
  LIMIT 1;
$$;

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
    WHEN start_time <= end_time THEN
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

CREATE OR REPLACE FUNCTION public.is_gestor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema u
    WHERE lower(u.email) = public.auth_email()
      AND public.is_active_status(u.status)
  ) AND public.gestor_schedule_allows_access();
$$;

CREATE OR REPLACE FUNCTION public.gestor_has_module(p_module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.gestor_schedule_allows_access()
    AND jsonb_typeof(public.gestor_effective_permissions() -> 'modules') = 'array'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(public.gestor_effective_permissions() -> 'modules') module_value(value)
      WHERE module_value.value = p_module
         OR (p_module = 'inicio' AND module_value.value = 'dashboard')
    );
$$;

CREATE OR REPLACE FUNCTION public.gestor_has_financeiro_tab(p_tab text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.gestor_has_module('financeiro')
    AND jsonb_typeof(public.gestor_effective_permissions() -> 'financeiroTabs') = 'array'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(public.gestor_effective_permissions() -> 'financeiroTabs') tab_value(value)
      WHERE tab_value.value = p_tab
    );
$$;

CREATE OR REPLACE FUNCTION public.gestor_has_tab(p_module text, p_tab text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.gestor_has_module(p_module)
    AND CASE
      WHEN jsonb_typeof(public.gestor_effective_permissions() -> 'tabs' -> p_module) = 'array' THEN EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(public.gestor_effective_permissions() -> 'tabs' -> p_module) tab_value(value)
        WHERE tab_value.value = p_tab
      )
      WHEN p_module = 'financeiro' THEN public.gestor_has_financeiro_tab(p_tab)
      ELSE true
    END;
$$;

CREATE OR REPLACE FUNCTION public.gestor_allowed_polo_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT public.gestor_schedule_allows_access() THEN ARRAY[]::uuid[]
    WHEN cardinality(coalesce(u.polo_ids, ARRAY[]::uuid[])) > 0 THEN u.polo_ids
    WHEN u.context ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN ARRAY[u.context::uuid]
    ELSE ARRAY[]::uuid[]
  END
  FROM public.usuarios_sistema u
  WHERE lower(u.email) = public.auth_email()
    AND public.is_active_status(u.status)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.gestor_has_all_polos()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.gestor_schedule_allows_access()
    AND coalesce((public.gestor_effective_permissions() ->> 'allPolos')::boolean, false)
    AND cardinality(coalesce(u.polo_ids, ARRAY[]::uuid[])) = 0
  FROM public.usuarios_sistema u
  WHERE lower(u.email) = public.auth_email()
    AND public.is_active_status(u.status)
  LIMIT 1;
$$;

ALTER TABLE public.perfis_acesso ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir escrita geral para gestores" ON public.perfis_acesso;
DROP POLICY IF EXISTS "Permitir leitura geral para gestores" ON public.perfis_acesso;
DROP POLICY IF EXISTS portal_perfis_acesso_select ON public.perfis_acesso;
DROP POLICY IF EXISTS portal_perfis_acesso_insert ON public.perfis_acesso;
DROP POLICY IF EXISTS portal_perfis_acesso_update ON public.perfis_acesso;
DROP POLICY IF EXISTS portal_perfis_acesso_delete ON public.perfis_acesso;

CREATE POLICY portal_perfis_acesso_select ON public.perfis_acesso
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios_sistema u
      WHERE lower(u.email) = public.auth_email()
        AND public.is_active_status(u.status)
        AND u.perfil_acesso_id = perfis_acesso.id
    )
    OR (public.is_gestor_global() AND public.gestor_has_module('configuracoes'))
  );
CREATE POLICY portal_perfis_acesso_insert ON public.perfis_acesso
  FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor_global() AND public.gestor_has_module('configuracoes'));
CREATE POLICY portal_perfis_acesso_update ON public.perfis_acesso
  FOR UPDATE TO authenticated
  USING (public.is_gestor_global() AND public.gestor_has_module('configuracoes'))
  WITH CHECK (public.is_gestor_global() AND public.gestor_has_module('configuracoes'));
CREATE POLICY portal_perfis_acesso_delete ON public.perfis_acesso
  FOR DELETE TO authenticated
  USING (public.is_gestor_global() AND public.gestor_has_module('configuracoes'));

DROP POLICY IF EXISTS portal_usuarios_sistema_insert_global ON public.usuarios_sistema;
DROP POLICY IF EXISTS portal_usuarios_sistema_update_global ON public.usuarios_sistema;
DROP POLICY IF EXISTS portal_usuarios_sistema_delete_global ON public.usuarios_sistema;
DROP POLICY IF EXISTS portal_usuarios_sistema_write_global ON public.usuarios_sistema;
CREATE POLICY portal_usuarios_sistema_insert_global ON public.usuarios_sistema
  FOR INSERT TO authenticated
  WITH CHECK (public.is_gestor_global() AND public.gestor_has_module('configuracoes'));
CREATE POLICY portal_usuarios_sistema_update_global ON public.usuarios_sistema
  FOR UPDATE TO authenticated
  USING (public.is_gestor_global() AND public.gestor_has_module('configuracoes'))
  WITH CHECK (public.is_gestor_global() AND public.gestor_has_module('configuracoes'));
CREATE POLICY portal_usuarios_sistema_delete_global ON public.usuarios_sistema
  FOR DELETE TO authenticated
  USING (public.is_gestor_global() AND public.gestor_has_module('configuracoes'));

REVOKE ALL ON TABLE public.perfis_acesso FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.perfis_acesso FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.perfis_acesso TO authenticated;
GRANT ALL ON TABLE public.perfis_acesso TO service_role;

REVOKE EXECUTE ON FUNCTION public.gestor_effective_permissions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gestor_effective_schedule() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gestor_schedule_allows_access() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.gestor_has_tab(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestor_schedule_allows_access() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gestor_has_tab(text, text) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.registrar_sistema_evento_trigger()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_sistema_eventos_audit ON public.perfis_acesso;
    CREATE TRIGGER trg_sistema_eventos_audit
      AFTER INSERT OR UPDATE OR DELETE ON public.perfis_acesso
      FOR EACH ROW EXECUTE FUNCTION public.registrar_sistema_evento_trigger();
  END IF;
END $$;

COMMIT;
