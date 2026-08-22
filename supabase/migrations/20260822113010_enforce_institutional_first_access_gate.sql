-- Propaga o estado persistido de primeiro acesso para RLS e assinatura.

BEGIN;

-- Este helper é a raiz dos helpers de módulo, polo e financeiro usados nas RLS.
CREATE OR REPLACE FUNCTION public.gestor_schedule_allows_access()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_schedule jsonb;
  v_current_day integer;
  v_access_time text;
  v_start_time text;
  v_end_time text;
BEGIN
  IF NOT coalesce(
    public.portal_identidade_institucional_acesso_liberado(
      auth.uid(), 'GESTOR'
    ), false
  ) THEN
    RETURN false;
  END IF;

  v_schedule := public.gestor_effective_schedule();
  v_current_day := pg_catalog.date_part(
    'dow', pg_catalog.now() AT TIME ZONE 'America/Maceio'
  )::integer;
  v_access_time := pg_catalog.to_char(
    pg_catalog.now() AT TIME ZONE 'America/Maceio', 'HH24:MI'
  );
  v_start_time := v_schedule ->> 'horario_inicio';
  v_end_time := v_schedule ->> 'horario_fim';

  IF v_schedule IS NULL
     OR pg_catalog.jsonb_typeof(v_schedule -> 'ativo') <> 'boolean' THEN
    RETURN false;
  ELSIF NOT (v_schedule ->> 'ativo')::boolean THEN
    RETURN true;
  ELSIF pg_catalog.jsonb_typeof(v_schedule -> 'dias') <> 'array'
     OR v_start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     OR v_end_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     OR v_start_time = v_end_time THEN
    RETURN false;
  ELSIF v_start_time < v_end_time THEN
    RETURN v_access_time BETWEEN v_start_time AND v_end_time
      AND EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_array_elements_text(v_schedule -> 'dias') AS dia(valor)
        WHERE dia.valor::integer = v_current_day
      );
  ELSIF v_access_time >= v_start_time THEN
    RETURN EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements_text(v_schedule -> 'dias') AS dia(valor)
      WHERE dia.valor::integer = v_current_day
    );
  ELSIF v_access_time <= v_end_time THEN
    RETURN EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements_text(v_schedule -> 'dias') AS dia(valor)
      WHERE dia.valor::integer = ((v_current_day + 6) % 7)
    );
  END IF;

  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.gestor_schedule_allows_access()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gestor_schedule_allows_access()
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_gestor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT coalesce(
    public.portal_identidade_institucional_acesso_liberado(
      auth.uid(), 'GESTOR'
    ), false
  ) AND public.gestor_schedule_allows_access();
$function$;

REVOKE ALL ON FUNCTION public.is_gestor()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_gestor()
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_professor_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT professor.id
  FROM public.parceiros AS professor
  WHERE professor.auth_user_id = auth.uid()
    AND upper(coalesce(professor.tipo, '')) = 'PROFESSOR'
    AND coalesce(public.is_active_status(professor.status), false)
    AND public.portal_identidade_institucional_acesso_liberado(
      auth.uid(), 'PROFESSOR'
    )
  ORDER BY professor.created_at DESC NULLS LAST, professor.id
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.current_professor_id()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_professor_id()
  TO anon, authenticated, service_role;

-- CREATE OR REPLACE mantém o OID: policies/funções já compiladas também
-- passam pela barreira, em vez de continuarem presas a um corpo renomeado.
CREATE OR REPLACE FUNCTION public.assinatura_eletronica_perfil_contexto_valido(
  p_actor_auth_user_id uuid,
  p_perfil text,
  p_context_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT CASE upper(btrim(coalesce(p_perfil, '')))
    WHEN 'GESTOR' THEN coalesce(
      public.portal_identidade_institucional_acesso_liberado(
        p_actor_auth_user_id, 'GESTOR'
      ), false
    ) AND EXISTS (
      SELECT 1
      FROM public.usuarios_sistema AS gestor
      WHERE gestor.id = p_context_id
        AND gestor.auth_user_id = p_actor_auth_user_id
        AND public.is_active_status(gestor.status)
    )
    WHEN 'PROFESSOR' THEN coalesce(
      public.portal_identidade_institucional_acesso_liberado(
        p_actor_auth_user_id, 'PROFESSOR'
      ), false
    ) AND EXISTS (
      SELECT 1
      FROM public.parceiros AS professor
      WHERE professor.id = p_context_id
        AND professor.auth_user_id = p_actor_auth_user_id
        AND upper(professor.tipo) = 'PROFESSOR'
        AND public.is_active_status(professor.status)
    )
    WHEN 'COORDENADOR' THEN coalesce(
      public.portal_identidade_institucional_acesso_liberado(
        p_actor_auth_user_id, 'PROFESSOR'
      ), false
    ) AND EXISTS (
      SELECT 1
      FROM public.parceiros AS professor
      JOIN public.professores_coordenacoes AS coordenacao
        ON coordenacao.professor_id = professor.id
      WHERE professor.id = p_context_id
        AND professor.auth_user_id = p_actor_auth_user_id
        AND upper(professor.tipo) = 'PROFESSOR'
        AND public.is_active_status(professor.status)
        AND coordenacao.status = 'ATIVA'
        AND coordenacao.vigente_de <= pg_catalog.statement_timestamp()
        AND (
          coordenacao.vigente_ate IS NULL
          OR coordenacao.vigente_ate > pg_catalog.statement_timestamp()
        )
    )
    WHEN 'RESPONSAVEL_LEGAL' THEN EXISTS (
      SELECT 1
      FROM public.responsaveis_legais AS responsavel
      WHERE responsavel.id = p_context_id
        AND responsavel.auth_user_id = p_actor_auth_user_id
        AND responsavel.status = 'ATIVO'
        AND responsavel.senha_atualizada_em IS NOT NULL
        AND NOT coalesce(responsavel.troca_senha_obrigatoria, false)
        AND NOT (
          coalesce(responsavel.senha_temporaria_pendente, false)
          AND (
            responsavel.senha_temporaria_emitida_em IS NULL
            OR responsavel.senha_atualizada_em IS NULL
            OR responsavel.senha_atualizada_em <=
              responsavel.senha_temporaria_emitida_em
          )
        )
        AND coalesce(responsavel.aceitou_termos_uso, false)
        AND responsavel.aceitou_termos_uso_em IS NOT NULL
        AND responsavel.termos_uso_versao =
          public.portal_identidade_termos_versao_vigente()
    )
    WHEN 'ALUNO' THEN EXISTS (
      SELECT 1
      FROM public.parceiros AS aluno
      WHERE aluno.id = p_context_id
        AND aluno.auth_user_id = p_actor_auth_user_id
        AND upper(aluno.tipo) = 'ALUNO'
        AND public.is_active_status(aluno.status)
        AND NOT coalesce(aluno.troca_senha_obrigatoria, false)
        AND NOT (
          coalesce(aluno.senha_temporaria_pendente, false)
          AND (
            aluno.senha_temporaria_emitida_em IS NULL
            OR aluno.senha_atualizada_em IS NULL
            OR aluno.senha_atualizada_em <=
              aluno.senha_temporaria_emitida_em
          )
        )
        AND coalesce(aluno.aceitou_termos_uso, false)
        AND aluno.termos_uso_versao =
          public.portal_identidade_termos_versao_vigente()
    )
    ELSE false
  END;
$function$;

REVOKE ALL ON FUNCTION
  public.assinatura_eletronica_perfil_contexto_valido(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
