-- Rollout coordenado com portal-user-management: a assinatura antiga não
-- conhece a identidade conferida pelo gestor e é removida. Nenhum parâmetro
-- esperado possui DEFAULT; clientes antigos falham sem confirmar outro e-mail.
BEGIN;

DROP FUNCTION IF EXISTS public.portal_validar_email_aluno_por_gestor(uuid, uuid);

CREATE OR REPLACE FUNCTION public.portal_validar_email_aluno_por_gestor(
  p_partner_id uuid,
  p_actor_auth_user_id uuid,
  p_expected_auth_user_id uuid,
  p_expected_email text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_contexto jsonb;
  v_aluno public.parceiros%ROWTYPE;
  v_email text := lower(nullif(btrim(p_expected_email), ''));
  v_auth_email text;
  v_auth_confirmado_em timestamptz;
  v_auth_metadata jsonb;
  v_gestor public.usuarios_sistema%ROWTYPE;
  v_cpf text;
  v_confirmou_auth boolean := false;
  v_registrou_validacao boolean := false;
BEGIN
  -- A autorização precede inclusive as tentativas repetidas de confirmação.
  v_contexto := public.portal_identidade_exigir_service_role_actor(
    p_actor_auth_user_id
  );
  IF p_partner_id IS NULL OR p_expected_auth_user_id IS NULL
     OR v_email IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'PORTAL_VALIDACAO_EMAIL_IDENTIDADE_ESPERADA_OBRIGATORIA';
  END IF;

  IF NOT public.portal_identidade_actor_pode_gerir_aluno(v_contexto, p_partner_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'PORTAL_VALIDACAO_EMAIL_FORA_DO_ESCOPO';
  END IF;

  -- NOWAIT evita aguardar Auth segurando a linha do perfil: o Auth atualiza
  -- primeiro auth.users e depois propaga o estado para os perfis vinculados.
  SELECT aluno.* INTO v_aluno
  FROM public.parceiros AS aluno
  WHERE aluno.id = p_partner_id
  FOR UPDATE NOWAIT;
  IF NOT FOUND OR upper(btrim(coalesce(v_aluno.tipo, ''))) <> 'ALUNO'
     OR NOT coalesce(public.is_active_status(v_aluno.status), false) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'PORTAL_VALIDACAO_EMAIL_ALUNO_INVALIDO';
  END IF;
  IF NOT public.portal_identidade_actor_pode_gerir_aluno(v_contexto, p_partner_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'PORTAL_VALIDACAO_EMAIL_FORA_DO_ESCOPO';
  END IF;

  IF v_aluno.auth_user_id IS DISTINCT FROM p_expected_auth_user_id
     OR lower(nullif(btrim(v_aluno.email), '')) IS DISTINCT FROM v_email
     OR lower(coalesce(nullif(btrim(v_aluno.auth_login_email), ''),
       nullif(btrim(v_aluno.email), ''))) IS DISTINCT FROM v_email
     OR v_email LIKE '%@acesso.universocc.invalid' THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'PORTAL_VALIDACAO_EMAIL_IDENTIDADE_ALTERADA';
  END IF;

  IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
      'portal-temporary-password-auth:' || p_expected_auth_user_id::text, 0
    )) OR NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
      'portal-auth-identity:' || p_expected_auth_user_id::text, 0
    )) THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'PORTAL_IDENTIDADE_CREDENCIAL_COMPARTILHADA_OCUPADA';
  END IF;

  SELECT lower(nullif(btrim(usuario.email), '')), usuario.email_confirmed_at,
    coalesce(usuario.raw_app_meta_data, '{}'::jsonb)
  INTO v_auth_email, v_auth_confirmado_em, v_auth_metadata
  FROM auth.users AS usuario
  WHERE usuario.id = p_expected_auth_user_id
  FOR UPDATE NOWAIT;
  IF NOT FOUND OR v_auth_email IS DISTINCT FROM v_email THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'PORTAL_VALIDACAO_EMAIL_IDENTIDADE_ALTERADA';
  END IF;

  -- Não confirma durante emissão/reconciliação. A reserva e todos os fences
  -- continuam pertencendo exclusivamente ao fluxo de senha temporária.
  IF nullif(v_auth_metadata ->> 'universocc_temporary_password_issue_id', '') IS NOT NULL
     OR nullif(v_auth_metadata ->> 'universocc_temporary_password_write_nonce', '') IS NOT NULL
     OR nullif(v_auth_metadata ->> 'universocc_responsavel_temporary_password_issue_id', '') IS NOT NULL
     OR nullif(v_auth_metadata ->> 'universocc_responsavel_temporary_password_write_nonce', '') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM public.parceiros AS perfil
       WHERE perfil.auth_user_id = p_expected_auth_user_id
         AND (
           perfil.senha_temporaria_emissao_id IS NOT NULL
           OR perfil.senha_temporaria_emissao_iniciada_em IS NOT NULL
           OR perfil.senha_temporaria_emissao_senha_alterada_em IS NOT NULL
           OR coalesce(perfil.senha_temporaria_pendente, false)
         )
     ) OR EXISTS (
       SELECT 1 FROM public.responsaveis_legais AS perfil
       WHERE perfil.auth_user_id = p_expected_auth_user_id
         AND (
           perfil.senha_temporaria_emissao_id IS NOT NULL
           OR perfil.senha_temporaria_emissao_iniciada_em IS NOT NULL
           OR perfil.senha_temporaria_emissao_senha_alterada_em IS NOT NULL
           OR coalesce(perfil.senha_temporaria_pendente, false)
         )
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'PORTAL_VALIDACAO_EMAIL_EMISSAO_TEMPORARIA_PENDENTE';
  END IF;

  -- Reconfere a identidade civil dentro das mesmas advisories que protegem
  -- vínculos/alterações/exclusões. Metadados editáveis não provam titularidade.
  v_cpf := pg_catalog.regexp_replace(coalesce(v_aluno.cpf_cnpj, ''), '[^0-9]', '', 'g');
  IF EXISTS (
    WITH outros AS (
      SELECT perfil.cpf_cnpj AS cpf,
        coalesce(nullif(btrim(perfil.auth_login_email), ''), perfil.email) AS email,
        upper(btrim(coalesce(perfil.tipo, ''))) = 'PROFESSOR' AS papel_compativel
      FROM public.parceiros AS perfil
      WHERE perfil.auth_user_id = p_expected_auth_user_id AND perfil.id <> v_aluno.id
      UNION ALL
      SELECT perfil.cpf, perfil.email, true FROM public.usuarios_sistema AS perfil
      WHERE perfil.auth_user_id = p_expected_auth_user_id
      UNION ALL
      SELECT perfil.cpf_normalizado, perfil.email, true
      FROM public.responsaveis_legais AS perfil
      WHERE perfil.auth_user_id = p_expected_auth_user_id
    )
    SELECT 1 FROM outros
    WHERE NOT papel_compativel
      OR NOT coalesce(public.is_valid_cpf(v_cpf), false)
      OR pg_catalog.regexp_replace(coalesce(outros.cpf, ''), '[^0-9]', '', 'g')
        IS DISTINCT FROM v_cpf
      OR lower(nullif(btrim(outros.email), '')) IS DISTINCT FROM v_email
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'PORTAL_IDENTIDADE_MULTIPERFIL_DIVERGENTE';
  END IF;

  SELECT gestor.* INTO v_gestor FROM public.usuarios_sistema AS gestor
  WHERE gestor.auth_user_id = p_actor_auth_user_id
    AND coalesce(public.is_active_status(gestor.status), false)
  LIMIT 1 FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'GESTOR_PARCEIROS_NAO_AUTORIZADO';
  END IF;
  -- Recalcula as permissões após as locks; o escopo do gestor também pode ter
  -- mudado desde o preflight. A lock acima mantém seu status/escopo até o commit.
  v_contexto := public.portal_identidade_exigir_service_role_actor(p_actor_auth_user_id);
  IF NOT public.portal_identidade_actor_pode_gerir_aluno(v_contexto, p_partner_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'PORTAL_VALIDACAO_EMAIL_FORA_DO_ESCOPO';
  END IF;

  IF v_aluno.email_validado_gestor_em IS NULL THEN
    UPDATE public.parceiros
    SET email_validado_gestor_em = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.statement_timestamp()
    WHERE id = p_partner_id;
    v_registrou_validacao := true;
  END IF;

  -- O trigger vigente reaproveita senha própria persistida sem alterar hash.
  -- Não escreve raw_user_meta_data.email_verified: esse metadado não governa
  -- o login e escrevê-lo acionaria sincronizadores de signup/perfil fora do escopo.
  -- Recuperação, sessões, termos, invited_at e a senha permanecem intactos.
  IF v_auth_confirmado_em IS NULL THEN
    UPDATE auth.users
    SET email_confirmed_at = pg_catalog.clock_timestamp(),
      confirmation_token = '', updated_at = pg_catalog.statement_timestamp()
    WHERE id = p_expected_auth_user_id;
    DELETE FROM auth.one_time_tokens
    WHERE user_id = p_expected_auth_user_id
      AND token_type = 'confirmation_token'::auth.one_time_token_type;
    v_confirmou_auth := true;
  END IF;

  IF v_registrou_validacao OR v_confirmou_auth THEN
    INSERT INTO public.sistema_eventos (
      actor_id, actor_nome, actor_email, actor_tipo,
      pessoa_id, pessoa_nome, pessoa_tipo, polo_id,
      modulo, entidade, entidade_id, acao, descricao, origem, detalhes
    ) VALUES (
      v_gestor.id, v_gestor.nome, v_gestor.email, 'Gestor',
      v_aluno.id, v_aluno.nome, 'Aluno', v_aluno.polo_id,
      'Parceiros', 'parceiros', v_aluno.id::text,
      'Confirmou e-mail para acesso assistido',
      'Confirmou a titularidade administrativa do e-mail de acesso, preservando a senha e os termos.',
      'Aplicativo', pg_catalog.jsonb_build_object(
        'confirmationMethod', 'manager_validated_contact',
        'authEmailConfirmed', v_confirmou_auth,
        'managerValidationRecorded', v_registrou_validacao
      )
    );
  END IF;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_validar_email_aluno_por_gestor(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_validar_email_aluno_por_gestor(uuid, uuid, uuid, text)
  TO service_role;

COMMIT;
