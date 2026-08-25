-- A reserva do Aluno ja possui a linha travada quando disputa a credencial
-- global. Antes das guardas compartilhadas, ela passa a falhar para retry em
-- vez de esperar segurando a row lock.

BEGIN;

CREATE OR REPLACE FUNCTION public.portal_reservar_emissao_senha_temporaria(
  p_partner_id uuid,
  p_emissao_id uuid,
  p_actor_auth_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_aluno public.parceiros%ROWTYPE;
  v_contexto jsonb;
  v_termos_versao_vigente text :=
    public.portal_identidade_termos_versao_vigente();
BEGIN
  v_contexto := public.portal_identidade_exigir_service_role_actor(
    p_actor_auth_user_id
  );

  IF p_partner_id IS NULL OR p_emissao_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_PARAMETROS_INVALIDOS';
  END IF;

  IF NOT public.portal_identidade_actor_pode_gerir_aluno(
    v_contexto,
    p_partner_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_FORA_DO_ESCOPO';
  END IF;

  SELECT aluno.*
  INTO v_aluno
  FROM public.parceiros AS aluno
  WHERE aluno.id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND OR upper(coalesce(v_aluno.tipo, '')) <> 'ALUNO'
     OR v_aluno.auth_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_ALUNO_INVALIDO';
  END IF;

  IF NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'portal-temporary-password-auth:' || v_aluno.auth_user_id::text,
      0
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PORTAL_IDENTIDADE_CREDENCIAL_COMPARTILHADA_OCUPADA';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.parceiros AS outro_perfil
    WHERE outro_perfil.auth_user_id = v_aluno.auth_user_id
      AND outro_perfil.id <> v_aluno.id
  ) OR EXISTS (
    SELECT 1
    FROM public.usuarios_sistema AS usuario_interno
    WHERE usuario_interno.auth_user_id = v_aluno.auth_user_id
  ) OR EXISTS (
    SELECT 1
    FROM public.responsaveis_legais AS responsavel
    WHERE responsavel.auth_user_id = v_aluno.auth_user_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_ALUNO_IDENTIDADE_MULTIPERFIL';
  END IF;

  IF v_aluno.acesso_status = 'ativo'
     AND coalesce(v_aluno.troca_senha_obrigatoria, false) = false
     AND coalesce(v_aluno.aceitou_termos_uso, false) = true
     AND v_aluno.termos_uso_versao = v_termos_versao_vigente
     AND NOT (
       coalesce(v_aluno.senha_temporaria_pendente, false)
       AND (
         v_aluno.senha_temporaria_emitida_em IS NULL
         OR v_aluno.senha_atualizada_em IS NULL
         OR v_aluno.senha_atualizada_em <= v_aluno.senha_temporaria_emitida_em
       )
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_PRIMEIRO_ACESSO_CONCLUIDO';
  END IF;

  IF v_aluno.senha_temporaria_emissao_id IS NOT NULL THEN
    RETURN v_aluno.senha_temporaria_emissao_iniciada_em IS NOT NULL
      AND v_aluno.senha_temporaria_emissao_id = p_emissao_id;
  END IF;

  UPDATE public.parceiros AS aluno
  SET
    troca_senha_obrigatoria = true,
    acesso_status = 'pendente',
    acesso_erro = NULL,
    acesso_ativado_em = NULL,
    senha_temporaria_pendente = true,
    senha_temporaria_emitida_em = NULL,
    senha_atualizada_em = NULL,
    senha_temporaria_emissao_id = p_emissao_id,
    senha_temporaria_emissao_iniciada_em = pg_catalog.clock_timestamp(),
    senha_temporaria_emissao_senha_alterada_em = NULL,
    updated_at = pg_catalog.statement_timestamp()
  WHERE aluno.id = p_partner_id;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION
  public.portal_reservar_emissao_senha_temporaria(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.portal_reservar_emissao_senha_temporaria(uuid, uuid, uuid)
  TO service_role;

COMMIT;
