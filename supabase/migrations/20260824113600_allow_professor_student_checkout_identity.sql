-- Permite que Professor, Gestor ou Responsavel autenticado adquira tambem o
-- contexto Aluno sem trocar de conta. A RPC continua idempotente, autorizada
-- pelo contexto de origem e serializada pelo UID.

BEGIN;

CREATE OR REPLACE FUNCTION public.portal_garantir_perfil_aluno_checkout(
  p_source_context_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_auth_email text;
  v_source_role text;
  v_source_name text;
  v_source_email text;
  v_source_cpf text;
  v_source_phone text;
  v_source_birth_date date;
  v_source_polo_id uuid;
  v_source_polo_ids uuid[] := ARRAY[]::uuid[];
  v_aluno public.parceiros%ROWTYPE;
  v_payload_sha256 text;
  v_replay jsonb;
  v_resultado jsonb;
  v_created boolean := false;
  v_linked boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'AUTENTICACAO_OBRIGATORIA';
  END IF;

  IF p_source_context_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ALUNO_CHECKOUT_PARAMETROS_INVALIDOS';
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO v_auth_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = v_actor;

  IF v_auth_email IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ALUNO_CHECKOUT_AUTH_EMAIL_OBRIGATORIO';
  END IF;

  -- Adquire as duas advisories antes de qualquer row lock. Assim Auth sync,
  -- reservas e vinculos concorrentes falham em suas guardas sem segurar Aluno,
  -- Responsavel, Gestor ou Professor em ordem inversa a este checkout.
  IF NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'portal-temporary-password-auth:' || v_actor::text,
      0
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PORTAL_IDENTIDADE_CREDENCIAL_COMPARTILHADA_OCUPADA';
  END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('portal-auth-identity:' || v_actor::text, 0)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PORTAL_IDENTIDADE_VINCULO_CONCORRENTE';
  END IF;

  -- O ID explicito torna a origem inequivoca mesmo quando o UID possui os
  -- dois tipos de Parceiro.
  SELECT
    upper(parceiro.tipo),
    parceiro.nome,
    lower(btrim(coalesce(
      nullif(parceiro.auth_login_email, ''),
      nullif(parceiro.email, '')
    ))),
    pg_catalog.regexp_replace(
      coalesce(parceiro.cpf_cnpj, ''),
      '[^0-9]',
      '',
      'g'
    ),
    parceiro.telefone,
    parceiro.data_nascimento,
    parceiro.polo_id,
    coalesce(parceiro.polo_ids, ARRAY[]::uuid[])
  INTO
    v_source_role,
    v_source_name,
    v_source_email,
    v_source_cpf,
    v_source_phone,
    v_source_birth_date,
    v_source_polo_id,
    v_source_polo_ids
  FROM public.parceiros AS parceiro
  WHERE parceiro.id = p_source_context_id
    AND parceiro.auth_user_id = v_actor
    AND upper(parceiro.tipo) IN ('ALUNO', 'PROFESSOR')
    AND coalesce(public.is_active_status(parceiro.status), false)
    AND (
      upper(parceiro.tipo) = 'ALUNO'
      OR public.portal_identidade_institucional_acesso_liberado(
        v_actor,
        'PROFESSOR'
      )
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT
      'GESTOR'::text,
      gestor.nome,
      lower(btrim(gestor.email)),
      pg_catalog.regexp_replace(
        coalesce(gestor.cpf, ''),
        '[^0-9]',
        '',
        'g'
      ),
      gestor.telefone,
      NULL::date,
      NULL::uuid,
      ARRAY[]::uuid[]
    INTO
      v_source_role,
      v_source_name,
      v_source_email,
      v_source_cpf,
      v_source_phone,
      v_source_birth_date,
      v_source_polo_id,
      v_source_polo_ids
    FROM public.usuarios_sistema AS gestor
    WHERE gestor.id = p_source_context_id
      AND gestor.auth_user_id = v_actor
      AND coalesce(public.is_active_status(gestor.status), false)
      AND public.portal_identidade_institucional_acesso_liberado(
        v_actor,
        'GESTOR'
      )
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    SELECT
      'RESPONSAVEL'::text,
      responsavel.nome,
      lower(nullif(btrim(responsavel.email), '')),
      pg_catalog.regexp_replace(
        coalesce(responsavel.cpf_normalizado, ''),
        '[^0-9]',
        '',
        'g'
      ),
      responsavel.telefone,
      NULL::date,
      NULL::uuid,
      ARRAY[]::uuid[]
    INTO
      v_source_role,
      v_source_name,
      v_source_email,
      v_source_cpf,
      v_source_phone,
      v_source_birth_date,
      v_source_polo_id,
      v_source_polo_ids
    FROM public.responsaveis_legais AS responsavel
    WHERE responsavel.id = p_source_context_id
      AND responsavel.auth_user_id = v_actor
      AND responsavel.status = 'ATIVO'
      AND responsavel.identidade_verificada_em IS NOT NULL
      AND coalesce(
        public.is_valid_cpf(
          pg_catalog.regexp_replace(
            coalesce(responsavel.cpf_normalizado, ''),
            '[^0-9]',
            '',
            'g'
          )
        ),
        false
      )
      AND lower(nullif(btrim(responsavel.email), '')) = v_auth_email
      AND responsavel.senha_atualizada_em IS NOT NULL
      AND NOT coalesce(responsavel.troca_senha_obrigatoria, false)
      AND NOT (
        coalesce(responsavel.senha_temporaria_pendente, false)
        AND (
          responsavel.senha_temporaria_emitida_em IS NULL
          OR responsavel.senha_atualizada_em <=
            responsavel.senha_temporaria_emitida_em
        )
      )
    FOR UPDATE;
  END IF;

  IF v_source_role IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ALUNO_CHECKOUT_CONTEXTO_NAO_AUTORIZADO';
  END IF;

  IF v_source_email IS DISTINCT FROM v_auth_email THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ALUNO_CHECKOUT_EMAIL_CANONICO_DIVERGENTE';
  END IF;

  -- A busca por UID e sempre delimitada ao papel Aluno. Um Professor no mesmo
  -- UID nao causa mais SELECT INTO ambiguo nem bloqueia a criacao do perfil.
  SELECT aluno_uid.*
  INTO v_aluno
  FROM public.parceiros AS aluno_uid
  WHERE aluno_uid.auth_user_id = v_actor
    AND upper(aluno_uid.tipo) = 'ALUNO'
  FOR UPDATE;

  IF FOUND AND NOT coalesce(
    public.is_active_status(v_aluno.status),
    false
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'ALUNO_CHECKOUT_PERFIL_INATIVO';
  END IF;

  IF v_aluno.id IS NULL
     AND v_source_role <> 'ALUNO'
     AND NOT coalesce(public.is_valid_cpf(v_source_cpf), false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'ALUNO_CHECKOUT_CPF_ORIGEM_OBRIGATORIO';
  END IF;

  v_payload_sha256 := public.portal_identidade_payload_sha256(
    pg_catalog.jsonb_build_object(
      'sourceContextId', p_source_context_id,
      'sourceRole', v_source_role
    )
  );
  v_replay := public.portal_identidade_obter_replay(
    v_actor,
    p_request_id,
    'ALUNO_CHECKOUT_GARANTIR',
    v_payload_sha256
  );

  IF v_replay IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.parceiros AS aluno_replay
      WHERE aluno_replay.id = (v_replay ->> 'alunoId')::uuid
        AND aluno_replay.auth_user_id = v_actor
        AND upper(aluno_replay.tipo) = 'ALUNO'
        AND coalesce(public.is_active_status(aluno_replay.status), false)
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'ALUNO_CHECKOUT_REPLAY_CONTEXTO_INVALIDO';
    END IF;
    RETURN v_replay;
  END IF;

  IF v_aluno.id IS NULL THEN
    SELECT aluno.*
    INTO v_aluno
    FROM public.parceiros AS aluno
    WHERE upper(aluno.tipo) = 'ALUNO'
      AND pg_catalog.regexp_replace(
        coalesce(aluno.cpf_cnpj, ''),
        '[^0-9]',
        '',
        'g'
      ) = v_source_cpf
    FOR UPDATE;

    IF FOUND THEN
      IF NOT coalesce(public.is_active_status(v_aluno.status), false) THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = 'ALUNO_CHECKOUT_PERFIL_INATIVO';
      END IF;

      IF v_aluno.auth_user_id IS NOT NULL
         AND v_aluno.auth_user_id IS DISTINCT FROM v_actor THEN
        RAISE EXCEPTION USING
          ERRCODE = '23505',
          MESSAGE = 'ALUNO_CHECKOUT_CPF_JA_VINCULADO';
      END IF;

      IF lower(btrim(coalesce(
        nullif(v_aluno.auth_login_email, ''),
        nullif(v_aluno.email, '')
      ))) IS DISTINCT FROM v_auth_email THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = 'ALUNO_CHECKOUT_IDENTIDADE_DIVERGENTE';
      END IF;

      UPDATE public.parceiros AS aluno
      SET
        auth_user_id = v_actor,
        auth_login_email = v_auth_email,
        senha_atualizada_em = coalesce(
          aluno.senha_atualizada_em,
          pg_catalog.statement_timestamp()
        ),
        troca_senha_obrigatoria = false,
        acesso_status = 'ativo',
        acesso_erro = NULL,
        acesso_ativado_em = coalesce(
          aluno.acesso_ativado_em,
          pg_catalog.clock_timestamp()
        ),
        updated_at = pg_catalog.statement_timestamp()
      WHERE aluno.id = v_aluno.id
      RETURNING aluno.* INTO v_aluno;

      v_linked := true;
    ELSE
      INSERT INTO public.parceiros (
        tipo,
        nome,
        cpf_cnpj,
        email,
        telefone,
        data_nascimento,
        polo_id,
        polo_ids,
        status,
        observacao,
        auth_user_id,
        auth_login_email,
        senha_atualizada_em,
        troca_senha_obrigatoria,
        acesso_status,
        acesso_erro,
        acesso_ativado_em
      ) VALUES (
        'Aluno',
        coalesce(nullif(btrim(v_source_name), ''), v_auth_email),
        v_source_cpf,
        v_auth_email,
        v_source_phone,
        v_source_birth_date,
        v_source_polo_id,
        v_source_polo_ids,
        'ATIVO',
        'Perfil de Aluno vinculado pelo fluxo autenticado de checkout.',
        v_actor,
        v_auth_email,
        pg_catalog.statement_timestamp(),
        false,
        'ativo',
        NULL,
        pg_catalog.clock_timestamp()
      )
      RETURNING * INTO v_aluno;

      v_created := true;
      v_linked := true;
    END IF;
  END IF;

  v_resultado := pg_catalog.jsonb_build_object(
    'alunoId', v_aluno.id,
    'contextId', v_aluno.id,
    'created', v_created,
    'linked', v_linked
  );

  RETURN public.portal_identidade_registrar_operacao(
    v_actor,
    p_request_id,
    'ALUNO_CHECKOUT_GARANTIR',
    v_payload_sha256,
    v_resultado
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_garantir_perfil_aluno_checkout(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_garantir_perfil_aluno_checkout(uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.portal_garantir_perfil_aluno_checkout(uuid, uuid) IS
  'Cria ou vincula Aluno ao Auth de Professor, Gestor ou Responsavel; idempotente e sem manipular senha ou aceite juridico.';

COMMIT;
