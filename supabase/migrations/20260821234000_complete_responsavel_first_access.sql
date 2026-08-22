-- Completa o ciclo de primeiro acesso do Responsável Legal sem alterar o
-- contrato já endurecido do Aluno. Convite normal exige senha criada e termos;
-- acesso assistido exige validação independente do e-mail, senha temporária,
-- troca posterior da senha e aceite dos termos vigentes.

BEGIN;

ALTER TABLE public.responsaveis_legais
  ADD COLUMN IF NOT EXISTS email_validado_gestor_em timestamptz,
  ADD COLUMN IF NOT EXISTS troca_senha_obrigatoria boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS senha_temporaria_pendente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS senha_temporaria_emitida_em timestamptz,
  ADD COLUMN IF NOT EXISTS senha_atualizada_em timestamptz,
  ADD COLUMN IF NOT EXISTS senha_temporaria_emissao_id uuid,
  ADD COLUMN IF NOT EXISTS senha_temporaria_emissao_iniciada_em timestamptz,
  ADD COLUMN IF NOT EXISTS senha_temporaria_emissao_senha_alterada_em timestamptz,
  ADD COLUMN IF NOT EXISTS senha_temporaria_emissoes_revogadas uuid[]
    NOT NULL DEFAULT ARRAY[]::uuid[],
  ADD COLUMN IF NOT EXISTS aceitou_termos_uso boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS aceitou_termos_uso_em timestamptz,
  ADD COLUMN IF NOT EXISTS termos_uso_versao text;

ALTER TABLE public.responsaveis_legais
  ADD CONSTRAINT responsaveis_legais_termos_primeiro_acesso_coerentes
  CHECK (
    (
      aceitou_termos_uso = false
      AND aceitou_termos_uso_em IS NULL
      AND termos_uso_versao IS NULL
    )
    OR (
      aceitou_termos_uso = true
      AND aceitou_termos_uso_em IS NOT NULL
      AND nullif(btrim(termos_uso_versao), '') IS NOT NULL
    )
  ),
  ADD CONSTRAINT responsaveis_legais_emissao_senha_temporaria_coerente
  CHECK (
    (
      senha_temporaria_emissao_iniciada_em IS NULL
      OR senha_temporaria_emissao_id IS NOT NULL
    )
    AND (
      senha_temporaria_emissao_senha_alterada_em IS NULL
      OR senha_temporaria_emissao_iniciada_em IS NOT NULL
    )
    AND (
      senha_temporaria_emissao_id IS NULL
      OR senha_temporaria_pendente = true
    )
  );

-- Ledger fechado para tornar o envio externo de recuperação idempotente. Uma
-- resposta perdida conserva RESERVADO e qualquer retry com o mesmo requestId
-- falha fechado sem disparar outro e-mail; falha definitiva pode ser tentada
-- novamente com o mesmo identificador depois de CANCELAR/FALHOU.
CREATE TABLE public.portal_responsavel_reenvios_acesso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_auth_user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  responsavel_legal_id uuid NOT NULL
    REFERENCES public.responsaveis_legais(id) ON DELETE RESTRICT,
  estado text NOT NULL DEFAULT 'RESERVADO'
    CHECK (estado IN ('RESERVADO', 'ENVIADO', 'FALHOU')),
  tentativas integer NOT NULL DEFAULT 1 CHECK (tentativas BETWEEN 1 AND 20),
  reservado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  falhou_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_responsavel_reenvios_estado_coerente CHECK (
    (estado = 'RESERVADO' AND concluido_em IS NULL AND falhou_em IS NULL)
    OR (estado = 'ENVIADO' AND concluido_em IS NOT NULL AND falhou_em IS NULL)
    OR (estado = 'FALHOU' AND concluido_em IS NULL AND falhou_em IS NOT NULL)
  ),
  UNIQUE (actor_auth_user_id, request_id)
);

CREATE INDEX portal_responsavel_reenvios_responsavel_idx
  ON public.portal_responsavel_reenvios_acesso
  (responsavel_legal_id, created_at DESC);

CREATE UNIQUE INDEX portal_responsavel_reenvios_reserva_ativa_key
  ON public.portal_responsavel_reenvios_acesso (responsavel_legal_id)
  WHERE estado = 'RESERVADO';

ALTER TABLE public.portal_responsavel_reenvios_acesso ENABLE ROW LEVEL SECURITY;

CREATE POLICY portal_responsavel_reenvios_client_deny
  ON public.portal_responsavel_reenvios_acesso
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.portal_responsavel_reenvios_acesso
  FROM PUBLIC, anon, authenticated, service_role;

-- Contas já vinculadas e com credencial não devem ser tratadas como convite
-- incompleto. O timestamp é somente uma referência canônica de existência da
-- credencial; nenhum hash ou segredo sai de auth.users.
UPDATE public.responsaveis_legais AS responsavel
SET senha_atualizada_em = coalesce(
  usuario_auth.updated_at,
  usuario_auth.created_at,
  pg_catalog.statement_timestamp()
)
FROM auth.users AS usuario_auth
WHERE usuario_auth.id = responsavel.auth_user_id
  AND coalesce(usuario_auth.encrypted_password, '') <> ''
  AND responsavel.senha_atualizada_em IS NULL;

-- Um vínculo Auth criado depois desta migration recebe o mesmo estado inicial
-- sem depender de uma futura alteração em auth.users. Convites ainda sem senha
-- permanecem com senha_atualizada_em nula até o callback do Auth.
CREATE OR REPLACE FUNCTION public.inicializar_acesso_responsavel_ao_vincular_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_senha_existente_em timestamptz;
  v_auth_email text;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.auth_user_id IS NOT DISTINCT FROM OLD.auth_user_id THEN
    RETURN NEW;
  END IF;

  -- Estado jurídico e de credencial pertence à identidade Auth vinculada.
  -- Remover ou substituir o UUID nunca transfere aceite/validação do titular
  -- anterior para uma conta nova, ainda que o endereço de e-mail seja igual.
  NEW.email_validado_gestor_em := NULL;
  NEW.troca_senha_obrigatoria := false;
  NEW.senha_temporaria_pendente := false;
  NEW.senha_temporaria_emitida_em := NULL;
  NEW.senha_atualizada_em := NULL;
  NEW.senha_temporaria_emissao_id := NULL;
  NEW.senha_temporaria_emissao_iniciada_em := NULL;
  NEW.senha_temporaria_emissao_senha_alterada_em := NULL;
  NEW.senha_temporaria_emissoes_revogadas := ARRAY[]::uuid[];
  NEW.aceitou_termos_uso := false;
  NEW.aceitou_termos_uso_em := NULL;
  NEW.termos_uso_versao := NULL;

  IF NEW.auth_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    lower(btrim(usuario_auth.email)),
    CASE
      WHEN coalesce(usuario_auth.encrypted_password, '') <> '' THEN
        coalesce(
          usuario_auth.updated_at,
          usuario_auth.created_at,
          pg_catalog.statement_timestamp()
        )
      ELSE NULL
    END
    INTO v_auth_email, v_senha_existente_em
  FROM auth.users AS usuario_auth
  WHERE usuario_auth.id = NEW.auth_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'RESPONSAVEL_AUTH_USUARIO_INEXISTENTE';
  END IF;

  IF v_auth_email IS NULL OR v_auth_email IS DISTINCT FROM NEW.email THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'RESPONSAVEL_AUTH_EMAIL_DIVERGENTE';
  END IF;

  NEW.senha_atualizada_em := v_senha_existente_em;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_reservar_emissao_senha_temporaria_responsavel(
  p_responsavel_legal_id uuid,
  p_emissao_id uuid,
  p_actor_auth_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_preparacao jsonb;
  v_responsavel public.responsaveis_legais%ROWTYPE;
  v_auth_email text;
  v_auth_email_confirmado_em timestamptz;
BEGIN
  IF p_responsavel_legal_id IS NULL OR p_emissao_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_RESPONSAVEL_PARAMETROS_INVALIDOS';
  END IF;

  v_preparacao := public.responsavel_legal_acesso_preparar(
    p_responsavel_legal_id,
    p_actor_auth_user_id
  );
  IF NOT coalesce((v_preparacao ->> 'eligible')::boolean, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'RESPONSAVEL_ACESSO_BLOQUEADO: ' || coalesce(
        v_preparacao ->> 'accessBlockReason',
        'REQUISITOS_INCOMPLETOS'
      );
  END IF;

  SELECT responsavel.*
    INTO v_responsavel
  FROM public.responsaveis_legais AS responsavel
  WHERE responsavel.id = p_responsavel_legal_id
  FOR UPDATE;

  IF NOT FOUND OR v_responsavel.auth_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'RESPONSAVEL_ACESSO_AUTH_OBRIGATORIO';
  END IF;

  -- Revalida autorização e elegibilidade sob o lock da identidade de domínio.
  v_preparacao := public.responsavel_legal_acesso_preparar(
    p_responsavel_legal_id,
    p_actor_auth_user_id
  );
  IF NOT coalesce((v_preparacao ->> 'eligible')::boolean, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'RESPONSAVEL_ACESSO_BLOQUEADO: ' || coalesce(
        v_preparacao ->> 'accessBlockReason',
        'REQUISITOS_INCOMPLETOS'
      );
  END IF;

  -- A senha pertence à identidade Auth inteira, não ao perfil isolado. O
  -- mesmo advisory lock é usado pelos triggers de vínculo abaixo para fechar
  -- a corrida entre esta reserva e a criação de um segundo perfil.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'portal-temporary-password-auth:' || v_responsavel.auth_user_id::text,
      0
    )
  );
  IF EXISTS (
    SELECT 1
    FROM public.parceiros AS outro_perfil
    WHERE outro_perfil.auth_user_id = v_responsavel.auth_user_id
  ) OR EXISTS (
    SELECT 1
    FROM public.usuarios_sistema AS usuario_interno
    WHERE usuario_interno.auth_user_id = v_responsavel.auth_user_id
  ) OR EXISTS (
    SELECT 1
    FROM public.responsaveis_legais AS outro_responsavel
    WHERE outro_responsavel.auth_user_id = v_responsavel.auth_user_id
      AND outro_responsavel.id <> v_responsavel.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE =
        'PORTAL_EMISSAO_SENHA_TEMPORARIA_RESPONSAVEL_IDENTIDADE_MULTIPERFIL';
  END IF;

  SELECT
    lower(btrim(usuario_auth.email)),
    usuario_auth.email_confirmed_at
    INTO v_auth_email, v_auth_email_confirmado_em
  FROM auth.users AS usuario_auth
  WHERE usuario_auth.id = v_responsavel.auth_user_id;

  IF v_auth_email IS NULL OR v_auth_email IS DISTINCT FROM v_responsavel.email THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'RESPONSAVEL_AUTH_EMAIL_DIVERGENTE';
  END IF;

  IF v_responsavel.email_validado_gestor_em IS NULL
     AND v_auth_email_confirmado_em IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_EMAIL_NAO_VALIDADO';
  END IF;

  IF coalesce((v_preparacao ->> 'firstAccessPending')::boolean, true) = false THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_PRIMEIRO_ACESSO_CONCLUIDO';
  END IF;

  IF v_responsavel.senha_temporaria_emissao_id IS NOT NULL THEN
    -- ID com início nulo está revogado/concluído e aguarda limpeza no Auth;
    -- nesse estado nem o mesmo request pode ser reutilizado.
    RETURN v_responsavel.senha_temporaria_emissao_iniciada_em IS NOT NULL
      AND v_responsavel.senha_temporaria_emissao_id = p_emissao_id;
  END IF;

  UPDATE public.responsaveis_legais AS responsavel
  SET
    troca_senha_obrigatoria = true,
    senha_temporaria_pendente = true,
    senha_temporaria_emitida_em = NULL,
    senha_atualizada_em = NULL,
    senha_temporaria_emissao_id = p_emissao_id,
    senha_temporaria_emissao_iniciada_em = pg_catalog.clock_timestamp(),
    senha_temporaria_emissao_senha_alterada_em = NULL
  WHERE responsavel.id = p_responsavel_legal_id;

  RETURN true;
END;
$function$;

-- O marcador do Aluno é preservado. O Responsável usa uma chave própria para
-- que uma identidade multiperfil não associe uma emissão ao domínio errado.
-- Marcador e nonce são preparados antes da senha porque o GoTrue persiste a
-- credencial antes de app_metadata quando ambos chegam na mesma requisição.
CREATE OR REPLACE FUNCTION public.rejeitar_emissao_senha_temporaria_revogada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_aluno_issue_text text;
  v_aluno_previous_issue_text text;
  v_aluno_write_nonce_text text;
  v_aluno_previous_write_nonce_text text;
  v_responsavel_issue_text text;
  v_responsavel_previous_issue_text text;
  v_responsavel_write_nonce_text text;
  v_responsavel_previous_write_nonce_text text;
  v_issue_id uuid;
  v_aluno public.parceiros%ROWTYPE;
  v_responsavel public.responsaveis_legais%ROWTYPE;
  v_password_changed boolean;
  v_aluno_marker_changed boolean;
  v_aluno_write_nonce_changed boolean;
  v_responsavel_marker_changed boolean;
  v_responsavel_write_nonce_changed boolean;
BEGIN
  v_password_changed := NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password;
  v_aluno_issue_text := lower(nullif(
    NEW.raw_app_meta_data ->> 'universocc_temporary_password_issue_id',
    ''
  ));
  v_aluno_previous_issue_text := lower(nullif(
    OLD.raw_app_meta_data ->> 'universocc_temporary_password_issue_id',
    ''
  ));
  v_aluno_write_nonce_text := lower(nullif(
    NEW.raw_app_meta_data ->> 'universocc_temporary_password_write_nonce',
    ''
  ));
  v_aluno_previous_write_nonce_text := lower(nullif(
    OLD.raw_app_meta_data ->> 'universocc_temporary_password_write_nonce',
    ''
  ));
  v_responsavel_issue_text := lower(nullif(
    NEW.raw_app_meta_data
      ->> 'universocc_responsavel_temporary_password_issue_id',
    ''
  ));
  v_responsavel_previous_issue_text := lower(nullif(
    OLD.raw_app_meta_data
      ->> 'universocc_responsavel_temporary_password_issue_id',
    ''
  ));
  v_responsavel_write_nonce_text := lower(nullif(
    NEW.raw_app_meta_data
      ->> 'universocc_responsavel_temporary_password_write_nonce',
    ''
  ));
  v_responsavel_previous_write_nonce_text := lower(nullif(
    OLD.raw_app_meta_data
      ->> 'universocc_responsavel_temporary_password_write_nonce',
    ''
  ));
  v_aluno_marker_changed :=
    v_aluno_issue_text IS DISTINCT FROM v_aluno_previous_issue_text;
  v_aluno_write_nonce_changed :=
    v_aluno_write_nonce_text IS DISTINCT FROM
      v_aluno_previous_write_nonce_text;
  v_responsavel_marker_changed :=
    v_responsavel_issue_text IS DISTINCT FROM v_responsavel_previous_issue_text;
  v_responsavel_write_nonce_changed :=
    v_responsavel_write_nonce_text IS DISTINCT FROM
      v_responsavel_previous_write_nonce_text;

  IF NOT v_password_changed
     AND NOT v_aluno_marker_changed
     AND NOT v_aluno_write_nonce_changed
     AND NOT v_responsavel_marker_changed
     AND NOT v_responsavel_write_nonce_changed THEN
    RETURN NEW;
  END IF;

  -- Pode haver mais de um papel na mesma identidade Auth. Cada linha é
  -- bloqueada e validada; não usamos SELECT INTO que escolheria um perfil.
  FOR v_aluno IN
    SELECT aluno.*
    FROM public.parceiros AS aluno
    WHERE aluno.auth_user_id = NEW.id
      AND upper(coalesce(aluno.tipo, '')) = 'ALUNO'
    ORDER BY aluno.id
    FOR UPDATE
  LOOP
    IF v_aluno.senha_temporaria_emissao_id IS NOT NULL
       AND v_aluno.senha_temporaria_emissao_iniciada_em IS NOT NULL THEN
      IF v_aluno_issue_text IS NULL
         OR v_aluno_issue_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR v_aluno_issue_text::uuid IS DISTINCT FROM
           v_aluno.senha_temporaria_emissao_id THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_MARCADOR_DIVERGENTE';
      END IF;

      IF v_password_changed THEN
        IF v_aluno_previous_issue_text IS NULL
           OR v_aluno_previous_issue_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           OR v_aluno_previous_issue_text::uuid IS DISTINCT FROM
             v_aluno.senha_temporaria_emissao_id
           OR v_aluno_write_nonce_text IS NULL
           OR v_aluno_write_nonce_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           OR v_aluno_write_nonce_text::uuid IS DISTINCT FROM
             v_aluno.senha_temporaria_emissao_id
           OR v_aluno_previous_write_nonce_text IS NULL
           OR v_aluno_previous_write_nonce_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           OR v_aluno_previous_write_nonce_text::uuid IS DISTINCT FROM
             v_aluno.senha_temporaria_emissao_id
           OR v_aluno_marker_changed
           OR v_aluno_write_nonce_changed
           OR v_aluno.senha_temporaria_emissao_senha_alterada_em
             IS NOT NULL THEN
          RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_ESCRITA_DIVERGENTE';
        END IF;

        UPDATE public.parceiros AS aluno
        SET senha_temporaria_emissao_senha_alterada_em =
          pg_catalog.clock_timestamp()
        WHERE aluno.id = v_aluno.id;
      ELSIF v_aluno_write_nonce_text IS NULL
         OR v_aluno_write_nonce_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR v_aluno_write_nonce_text::uuid IS DISTINCT FROM
           v_aluno.senha_temporaria_emissao_id
         OR (
           v_aluno_previous_issue_text IS NOT NULL
           AND (
             v_aluno_previous_issue_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
             OR v_aluno_previous_issue_text::uuid IS DISTINCT FROM
               v_aluno.senha_temporaria_emissao_id
           )
         )
         OR (
           v_aluno_previous_write_nonce_text IS NOT NULL
           AND (
             v_aluno_previous_write_nonce_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
             OR v_aluno_previous_write_nonce_text::uuid IS DISTINCT FROM
               v_aluno.senha_temporaria_emissao_id
           )
         )
         OR v_aluno.senha_temporaria_emissao_senha_alterada_em IS NOT NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_PREPARACAO_DIVERGENTE';
      END IF;
    END IF;

    IF v_aluno.senha_temporaria_emissao_id IS NOT NULL
       AND v_aluno.senha_temporaria_emissao_iniciada_em IS NULL THEN
      IF v_password_changed OR v_aluno_issue_text IS NOT NULL
         OR v_aluno_write_nonce_text IS NOT NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_LIMPEZA_PENDENTE';
      END IF;
      CONTINUE;
    END IF;

    IF v_aluno_issue_text IS NOT NULL
       AND v_aluno_issue_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      v_issue_id := v_aluno_issue_text::uuid;
      IF v_issue_id = ANY(coalesce(
        v_aluno.senha_temporaria_emissoes_revogadas,
        ARRAY[]::uuid[]
      )) THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_REVOGADA';
      END IF;
    END IF;
  END LOOP;

  FOR v_responsavel IN
    SELECT responsavel.*
    FROM public.responsaveis_legais AS responsavel
    WHERE responsavel.auth_user_id = NEW.id
    ORDER BY responsavel.id
    FOR UPDATE
  LOOP
    IF v_responsavel.senha_temporaria_emissao_id IS NOT NULL
       AND v_responsavel.senha_temporaria_emissao_iniciada_em IS NOT NULL THEN
      IF v_responsavel_issue_text IS NULL
         OR v_responsavel_issue_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR v_responsavel_issue_text::uuid IS DISTINCT FROM
           v_responsavel.senha_temporaria_emissao_id THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_RESPONSAVEL_MARCADOR_DIVERGENTE';
      END IF;

      IF v_password_changed THEN
        IF v_responsavel_previous_issue_text IS NULL
           OR v_responsavel_previous_issue_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           OR v_responsavel_previous_issue_text::uuid IS DISTINCT FROM
             v_responsavel.senha_temporaria_emissao_id
           OR v_responsavel_write_nonce_text IS NULL
           OR v_responsavel_write_nonce_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           OR v_responsavel_write_nonce_text::uuid IS DISTINCT FROM
             v_responsavel.senha_temporaria_emissao_id
           OR v_responsavel_previous_write_nonce_text IS NULL
           OR v_responsavel_previous_write_nonce_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
           OR v_responsavel_previous_write_nonce_text::uuid IS DISTINCT FROM
             v_responsavel.senha_temporaria_emissao_id
           OR v_responsavel_marker_changed
           OR v_responsavel_write_nonce_changed
           OR v_responsavel.senha_temporaria_emissao_senha_alterada_em
             IS NOT NULL THEN
          RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE =
              'PORTAL_EMISSAO_SENHA_TEMPORARIA_RESPONSAVEL_ESCRITA_DIVERGENTE';
        END IF;

        UPDATE public.responsaveis_legais AS responsavel
        SET senha_temporaria_emissao_senha_alterada_em =
          pg_catalog.clock_timestamp()
        WHERE responsavel.id = v_responsavel.id;
      ELSIF v_responsavel_write_nonce_text IS NULL
         OR v_responsavel_write_nonce_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR v_responsavel_write_nonce_text::uuid IS DISTINCT FROM
           v_responsavel.senha_temporaria_emissao_id
         OR (
           v_responsavel_previous_issue_text IS NOT NULL
           AND (
             v_responsavel_previous_issue_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
             OR v_responsavel_previous_issue_text::uuid IS DISTINCT FROM
               v_responsavel.senha_temporaria_emissao_id
           )
         )
         OR (
           v_responsavel_previous_write_nonce_text IS NOT NULL
           AND (
             v_responsavel_previous_write_nonce_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
             OR v_responsavel_previous_write_nonce_text::uuid IS DISTINCT FROM
               v_responsavel.senha_temporaria_emissao_id
           )
         )
         OR v_responsavel.senha_temporaria_emissao_senha_alterada_em IS NOT NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE =
            'PORTAL_EMISSAO_SENHA_TEMPORARIA_RESPONSAVEL_PREPARACAO_DIVERGENTE';
      END IF;
    END IF;

    IF v_responsavel.senha_temporaria_emissao_id IS NOT NULL
       AND v_responsavel.senha_temporaria_emissao_iniciada_em IS NULL THEN
      IF v_password_changed OR v_responsavel_issue_text IS NOT NULL
         OR v_responsavel_write_nonce_text IS NOT NULL THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_RESPONSAVEL_LIMPEZA_PENDENTE';
      END IF;
      CONTINUE;
    END IF;

    IF v_responsavel_issue_text IS NOT NULL
       AND v_responsavel_issue_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      v_issue_id := v_responsavel_issue_text::uuid;
      IF v_issue_id = ANY(coalesce(
        v_responsavel.senha_temporaria_emissoes_revogadas,
        ARRAY[]::uuid[]
      )) THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_RESPONSAVEL_REVOGADA';
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS a10_rejeitar_emissao_senha_temporaria_revogada
  ON auth.users;
CREATE TRIGGER a10_rejeitar_emissao_senha_temporaria_revogada
BEFORE UPDATE OF encrypted_password, raw_app_meta_data
ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.rejeitar_emissao_senha_temporaria_revogada();

REVOKE ALL ON FUNCTION public.rejeitar_emissao_senha_temporaria_revogada()
  FROM PUBLIC, anon, authenticated, service_role;

-- Conclusão, cancelamento e limpeza exigem service_role e gestor global/matriz,
-- mas não exigem que o vínculo continue elegível. Assim uma revogação ocorrida
-- depois da reserva não impede retirar com segurança o marcador do Auth.
CREATE OR REPLACE FUNCTION public.portal_concluir_emissao_senha_temporaria_responsavel(
  p_responsavel_legal_id uuid,
  p_emissao_id uuid,
  p_actor_auth_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_contexto jsonb;
  v_responsavel public.responsaveis_legais%ROWTYPE;
  v_auth_issue_id text;
  v_auth_write_nonce text;
  v_gestor_id uuid;
  v_gestor_nome text;
  v_gestor_email text;
BEGIN
  v_contexto := public.portal_identidade_exigir_service_role_actor(
    p_actor_auth_user_id
  );
  IF NOT coalesce((v_contexto ->> 'allPolos')::boolean, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'GESTOR_GLOBAL_OU_MATRIZ_OBRIGATORIO';
  END IF;

  IF p_responsavel_legal_id IS NULL OR p_emissao_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_RESPONSAVEL_PARAMETROS_INVALIDOS';
  END IF;

  SELECT responsavel.*
    INTO v_responsavel
  FROM public.responsaveis_legais AS responsavel
  WHERE responsavel.id = p_responsavel_legal_id
  FOR UPDATE;

  IF NOT FOUND OR v_responsavel.auth_user_id IS NULL THEN
    RETURN false;
  END IF;

  -- A revogação do papel do gestor durante a espera pelo lock fecha a
  -- operação; concluir uma emissão nunca confia apenas no pre-check.
  v_contexto := public.portal_identidade_exigir_service_role_actor(
    p_actor_auth_user_id
  );
  IF NOT coalesce((v_contexto ->> 'allPolos')::boolean, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'GESTOR_GLOBAL_OU_MATRIZ_OBRIGATORIO';
  END IF;

  SELECT
    nullif(
      usuario_auth.raw_app_meta_data
        ->> 'universocc_responsavel_temporary_password_issue_id',
      ''
    ),
    nullif(
      usuario_auth.raw_app_meta_data
        ->> 'universocc_responsavel_temporary_password_write_nonce',
      ''
    )
    INTO v_auth_issue_id, v_auth_write_nonce
  FROM auth.users AS usuario_auth
  WHERE usuario_auth.id = v_responsavel.auth_user_id;

  IF NOT FOUND
     OR v_responsavel.senha_temporaria_emissao_id IS DISTINCT FROM p_emissao_id
     OR v_responsavel.senha_temporaria_emissao_iniciada_em IS NULL
     OR p_emissao_id = ANY(coalesce(
       v_responsavel.senha_temporaria_emissoes_revogadas,
       ARRAY[]::uuid[]
     ))
     OR v_responsavel.senha_atualizada_em IS NULL
     OR v_responsavel.senha_atualizada_em <
       v_responsavel.senha_temporaria_emissao_iniciada_em
     OR v_responsavel.senha_temporaria_emissao_senha_alterada_em IS NULL
     OR v_auth_issue_id IS DISTINCT FROM p_emissao_id::text
     OR v_auth_write_nonce IS DISTINCT FROM p_emissao_id::text THEN
    RETURN false;
  END IF;

  SELECT gestor.id, gestor.nome, gestor.email
    INTO v_gestor_id, v_gestor_nome, v_gestor_email
  FROM public.usuarios_sistema AS gestor
  WHERE gestor.auth_user_id = p_actor_auth_user_id
    AND coalesce(public.is_active_status(gestor.status), false)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'GESTOR_PARCEIROS_NAO_AUTORIZADO';
  END IF;

  UPDATE public.responsaveis_legais AS responsavel
  SET
    troca_senha_obrigatoria = true,
    senha_temporaria_pendente = true,
    senha_temporaria_emitida_em = pg_catalog.clock_timestamp(),
    senha_temporaria_emissao_iniciada_em = NULL,
    senha_temporaria_emissao_senha_alterada_em = NULL,
    senha_temporaria_emissoes_revogadas = pg_catalog.array_append(
      pg_catalog.array_remove(
        coalesce(
          responsavel.senha_temporaria_emissoes_revogadas,
          ARRAY[]::uuid[]
        ),
        p_emissao_id
      ),
      p_emissao_id
    )
  WHERE responsavel.id = p_responsavel_legal_id;

  -- A senha nunca participa do evento. A operação só é considerada concluída
  -- quando estado e auditoria persistem na mesma transação.
  INSERT INTO public.sistema_eventos (
    actor_id,
    actor_nome,
    actor_email,
    actor_tipo,
    pessoa_id,
    pessoa_nome,
    pessoa_tipo,
    polo_id,
    modulo,
    entidade,
    entidade_id,
    acao,
    descricao,
    origem,
    detalhes
  )
  VALUES (
    v_gestor_id,
    v_gestor_nome,
    v_gestor_email,
    'Gestor',
    v_responsavel.id,
    v_responsavel.nome,
    'Responsável Legal',
    NULL,
    'Parceiros',
    'responsaveis_legais',
    v_responsavel.id::text,
    'Emitiu senha temporária',
    'Emitiu uma senha temporária para o responsável legal concluir o primeiro acesso.',
    'Aplicativo',
    pg_catalog.jsonb_build_object(
      'delivery',
      'manager_assisted',
      'firstAccessRequired',
      true
    )
  );

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_cancelar_emissao_senha_temporaria_responsavel(
  p_responsavel_legal_id uuid,
  p_emissao_id uuid,
  p_actor_auth_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_contexto jsonb;
  v_responsavel public.responsaveis_legais%ROWTYPE;
BEGIN
  v_contexto := public.portal_identidade_exigir_service_role_actor(
    p_actor_auth_user_id
  );
  IF NOT coalesce((v_contexto ->> 'allPolos')::boolean, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'GESTOR_GLOBAL_OU_MATRIZ_OBRIGATORIO';
  END IF;

  IF p_responsavel_legal_id IS NULL OR p_emissao_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_RESPONSAVEL_PARAMETROS_INVALIDOS';
  END IF;

  SELECT responsavel.*
    INTO v_responsavel
  FROM public.responsaveis_legais AS responsavel
  WHERE responsavel.id = p_responsavel_legal_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_responsavel.senha_temporaria_emissao_id IS DISTINCT FROM p_emissao_id
     OR v_responsavel.senha_temporaria_emissao_iniciada_em IS NULL THEN
    RETURN false;
  END IF;

  v_contexto := public.portal_identidade_exigir_service_role_actor(
    p_actor_auth_user_id
  );
  IF NOT coalesce((v_contexto ->> 'allPolos')::boolean, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'GESTOR_GLOBAL_OU_MATRIZ_OBRIGATORIO';
  END IF;

  UPDATE public.responsaveis_legais AS responsavel
  SET
    troca_senha_obrigatoria = true,
    senha_temporaria_pendente = true,
    senha_temporaria_emitida_em = NULL,
    senha_temporaria_emissao_iniciada_em = NULL,
    senha_temporaria_emissao_senha_alterada_em = NULL,
    senha_temporaria_emissoes_revogadas = pg_catalog.array_append(
      pg_catalog.array_remove(
        coalesce(
          responsavel.senha_temporaria_emissoes_revogadas,
          ARRAY[]::uuid[]
        ),
        p_emissao_id
      ),
      p_emissao_id
    )
  WHERE responsavel.id = p_responsavel_legal_id;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_confirmar_limpeza_emissao_senha_temporaria_responsavel(
  p_responsavel_legal_id uuid,
  p_emissao_id uuid,
  p_actor_auth_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_contexto jsonb;
  v_responsavel public.responsaveis_legais%ROWTYPE;
  v_auth_issue_id text;
  v_auth_write_nonce text;
BEGIN
  v_contexto := public.portal_identidade_exigir_service_role_actor(
    p_actor_auth_user_id
  );
  IF NOT coalesce((v_contexto ->> 'allPolos')::boolean, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'GESTOR_GLOBAL_OU_MATRIZ_OBRIGATORIO';
  END IF;

  IF p_responsavel_legal_id IS NULL OR p_emissao_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_RESPONSAVEL_PARAMETROS_INVALIDOS';
  END IF;

  SELECT responsavel.*
    INTO v_responsavel
  FROM public.responsaveis_legais AS responsavel
  WHERE responsavel.id = p_responsavel_legal_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_responsavel.auth_user_id IS NULL
     OR v_responsavel.senha_temporaria_emissao_id IS DISTINCT FROM p_emissao_id
     OR v_responsavel.senha_temporaria_emissao_iniciada_em IS NOT NULL
     OR NOT (
       p_emissao_id = ANY(coalesce(
         v_responsavel.senha_temporaria_emissoes_revogadas,
         ARRAY[]::uuid[]
       ))
     ) THEN
    RETURN false;
  END IF;

  v_contexto := public.portal_identidade_exigir_service_role_actor(
    p_actor_auth_user_id
  );
  IF NOT coalesce((v_contexto ->> 'allPolos')::boolean, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'GESTOR_GLOBAL_OU_MATRIZ_OBRIGATORIO';
  END IF;

  SELECT
    nullif(
      usuario_auth.raw_app_meta_data
        ->> 'universocc_responsavel_temporary_password_issue_id',
      ''
    ),
    nullif(
      usuario_auth.raw_app_meta_data
        ->> 'universocc_responsavel_temporary_password_write_nonce',
      ''
    )
    INTO v_auth_issue_id, v_auth_write_nonce
  FROM auth.users AS usuario_auth
  WHERE usuario_auth.id = v_responsavel.auth_user_id;

  -- Ausência do Auth ou presença de qualquer marcador mantém a trava fechada.
  IF NOT FOUND OR v_auth_issue_id IS NOT NULL
     OR v_auth_write_nonce IS NOT NULL THEN
    RETURN false;
  END IF;

  UPDATE public.responsaveis_legais AS responsavel
  SET
    senha_temporaria_emissao_id = NULL,
    senha_temporaria_emissao_iniciada_em = NULL,
    senha_temporaria_emissao_senha_alterada_em = NULL
  WHERE responsavel.id = p_responsavel_legal_id;

  RETURN true;
END;
$function$;

DROP TRIGGER IF EXISTS a05_inicializar_acesso_responsavel_ao_vincular_auth
  ON public.responsaveis_legais;
CREATE TRIGGER a05_inicializar_acesso_responsavel_ao_vincular_auth
BEFORE INSERT OR UPDATE ON public.responsaveis_legais
FOR EACH ROW
EXECUTE FUNCTION public.inicializar_acesso_responsavel_ao_vincular_auth();

REVOKE ALL ON FUNCTION public.inicializar_acesso_responsavel_ao_vincular_auth()
  FROM PUBLIC, anon, authenticated, service_role;

-- A validação do gestor é da caixa postal atual. Embora o fluxo canônico não
-- permita trocar o e-mail depois do vínculo Auth, a defesa também cobre
-- manutenção privilegiada e futuras extensões.
CREATE OR REPLACE FUNCTION public.limpar_validacao_email_responsavel_ao_alterar_identidade()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR lower(btrim(coalesce(NEW.email, ''))) IS DISTINCT FROM
       lower(btrim(coalesce(OLD.email, ''))) THEN
    NEW.email_validado_gestor_em := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS a10_limpar_validacao_email_responsavel
  ON public.responsaveis_legais;
CREATE TRIGGER a10_limpar_validacao_email_responsavel
BEFORE UPDATE OF auth_user_id, email ON public.responsaveis_legais
FOR EACH ROW
EXECUTE FUNCTION public.limpar_validacao_email_responsavel_ao_alterar_identidade();

REVOKE ALL ON FUNCTION public.limpar_validacao_email_responsavel_ao_alterar_identidade()
  FROM PUBLIC, anon, authenticated, service_role;

-- Defesa em profundidade: mesmo que uma permissão de tabela seja ampliada no
-- futuro, navegador algum pode forjar estado de credencial, termos ou vínculo
-- Auth. As RPCs SECURITY DEFINER executam como proprietárias e não são afetadas.
CREATE OR REPLACE FUNCTION public.proteger_campos_acesso_responsavel()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_cliente_direto boolean := current_user IN ('anon', 'authenticated');
BEGIN
  IF NOT v_cliente_direto THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.auth_user_id IS NOT NULL
       OR NEW.email_validado_gestor_em IS NOT NULL
       OR coalesce(NEW.troca_senha_obrigatoria, false)
       OR coalesce(NEW.senha_temporaria_pendente, false)
       OR NEW.senha_temporaria_emitida_em IS NOT NULL
       OR NEW.senha_atualizada_em IS NOT NULL
       OR NEW.senha_temporaria_emissao_id IS NOT NULL
       OR NEW.senha_temporaria_emissao_iniciada_em IS NOT NULL
       OR NEW.senha_temporaria_emissao_senha_alterada_em IS NOT NULL
       OR coalesce(
         pg_catalog.cardinality(NEW.senha_temporaria_emissoes_revogadas),
         0
       ) > 0
       OR coalesce(NEW.aceitou_termos_uso, false)
       OR NEW.aceitou_termos_uso_em IS NOT NULL
       OR NEW.termos_uso_versao IS NOT NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'RESPONSAVEL_CAMPOS_SENSIVEIS_EXIGEM_FLUXO_AUTORIZADO';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.email_validado_gestor_em IS DISTINCT FROM OLD.email_validado_gestor_em
     OR NEW.troca_senha_obrigatoria IS DISTINCT FROM OLD.troca_senha_obrigatoria
     OR NEW.senha_temporaria_pendente IS DISTINCT FROM OLD.senha_temporaria_pendente
     OR NEW.senha_temporaria_emitida_em IS DISTINCT FROM OLD.senha_temporaria_emitida_em
     OR NEW.senha_atualizada_em IS DISTINCT FROM OLD.senha_atualizada_em
     OR NEW.senha_temporaria_emissao_id IS DISTINCT FROM OLD.senha_temporaria_emissao_id
     OR NEW.senha_temporaria_emissao_iniciada_em IS DISTINCT FROM OLD.senha_temporaria_emissao_iniciada_em
     OR NEW.senha_temporaria_emissao_senha_alterada_em IS DISTINCT FROM OLD.senha_temporaria_emissao_senha_alterada_em
     OR NEW.senha_temporaria_emissoes_revogadas IS DISTINCT FROM OLD.senha_temporaria_emissoes_revogadas
     OR NEW.aceitou_termos_uso IS DISTINCT FROM OLD.aceitou_termos_uso
     OR NEW.aceitou_termos_uso_em IS DISTINCT FROM OLD.aceitou_termos_uso_em
     OR NEW.termos_uso_versao IS DISTINCT FROM OLD.termos_uso_versao THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'RESPONSAVEL_CAMPOS_SENSIVEIS_EXIGEM_FLUXO_AUTORIZADO';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS b10_proteger_campos_acesso_responsavel
  ON public.responsaveis_legais;
CREATE TRIGGER b10_proteger_campos_acesso_responsavel
BEFORE INSERT OR UPDATE ON public.responsaveis_legais
FOR EACH ROW
EXECUTE FUNCTION public.proteger_campos_acesso_responsavel();

REVOKE ALL ON FUNCTION public.proteger_campos_acesso_responsavel()
  FROM PUBLIC, anon, authenticated, service_role;

-- Uma senha temporária permanece válida até o titular trocá-la. Durante esse
-- período nenhum outro papel pode ser anexado ao mesmo auth.users: caso
-- contrário a credencial assistida também abriria o portal desse outro papel.
-- O mesmo lock usado pela reserva torna vínculo e emissão serializáveis.
CREATE OR REPLACE FUNCTION public.proteger_vinculo_auth_senha_temporaria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_old_row jsonb;
  v_new_row jsonb := pg_catalog.to_jsonb(NEW);
  v_proprio_acesso_temporario boolean := false;
  v_tipo_parceiro_alterado boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_row := pg_catalog.to_jsonb(OLD);
    v_proprio_acesso_temporario :=
      coalesce((v_old_row ->> 'senha_temporaria_pendente')::boolean, false)
      OR nullif(v_old_row ->> 'senha_temporaria_emissao_id', '') IS NOT NULL
      OR coalesce((v_new_row ->> 'senha_temporaria_pendente')::boolean, false)
      OR nullif(v_new_row ->> 'senha_temporaria_emissao_id', '') IS NOT NULL;
    v_tipo_parceiro_alterado := TG_TABLE_NAME = 'parceiros'
      AND upper(coalesce(v_new_row ->> 'tipo', '')) IS DISTINCT FROM
        upper(coalesce(v_old_row ->> 'tipo', ''));

    IF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
       AND v_proprio_acesso_temporario THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'PORTAL_VINCULO_AUTH_BLOQUEADO_POR_SENHA_TEMPORARIA';
    END IF;

    IF NEW.auth_user_id IS NOT DISTINCT FROM OLD.auth_user_id
       AND NOT v_tipo_parceiro_alterado THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.auth_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'portal-temporary-password-auth:' || NEW.auth_user_id::text,
      0
    )
  );

  IF v_tipo_parceiro_alterado AND v_proprio_acesso_temporario THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE =
        'PORTAL_VINCULO_AUTH_BLOQUEADO_POR_SENHA_TEMPORARIA';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.parceiros AS aluno
    WHERE aluno.auth_user_id = NEW.auth_user_id
      AND upper(coalesce(aluno.tipo, '')) = 'ALUNO'
      AND coalesce(aluno.senha_temporaria_pendente, false)
      AND (
        TG_TABLE_NAME <> 'parceiros'
        OR aluno.id IS DISTINCT FROM NEW.id
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.responsaveis_legais AS responsavel
    WHERE responsavel.auth_user_id = NEW.auth_user_id
      AND coalesce(responsavel.senha_temporaria_pendente, false)
      AND (
        TG_TABLE_NAME <> 'responsaveis_legais'
        OR responsavel.id IS DISTINCT FROM NEW.id
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE =
        'PORTAL_VINCULO_AUTH_BLOQUEADO_POR_SENHA_TEMPORARIA';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS b15_proteger_vinculo_auth_senha_temporaria
  ON public.parceiros;
CREATE TRIGGER b15_proteger_vinculo_auth_senha_temporaria
BEFORE INSERT OR UPDATE ON public.parceiros
FOR EACH ROW
EXECUTE FUNCTION public.proteger_vinculo_auth_senha_temporaria();

DROP TRIGGER IF EXISTS b15_proteger_vinculo_auth_senha_temporaria
  ON public.usuarios_sistema;
CREATE TRIGGER b15_proteger_vinculo_auth_senha_temporaria
BEFORE INSERT OR UPDATE ON public.usuarios_sistema
FOR EACH ROW
EXECUTE FUNCTION public.proteger_vinculo_auth_senha_temporaria();

DROP TRIGGER IF EXISTS b15_proteger_vinculo_auth_senha_temporaria
  ON public.responsaveis_legais;
CREATE TRIGGER b15_proteger_vinculo_auth_senha_temporaria
BEFORE INSERT OR UPDATE ON public.responsaveis_legais
FOR EACH ROW
EXECUTE FUNCTION public.proteger_vinculo_auth_senha_temporaria();

REVOKE ALL ON FUNCTION public.proteger_vinculo_auth_senha_temporaria()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.proteger_remocao_senha_temporaria_pendente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_old_row jsonb := pg_catalog.to_jsonb(OLD);
BEGIN
  IF coalesce(
       (v_old_row ->> 'senha_temporaria_pendente')::boolean,
       false
     )
     OR nullif(v_old_row ->> 'senha_temporaria_emissao_id', '') IS NOT NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_REMOCAO_BLOQUEADA_POR_SENHA_TEMPORARIA';
  END IF;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS b16_proteger_remocao_senha_temporaria_pendente
  ON public.parceiros;
CREATE TRIGGER b16_proteger_remocao_senha_temporaria_pendente
BEFORE DELETE ON public.parceiros
FOR EACH ROW
EXECUTE FUNCTION public.proteger_remocao_senha_temporaria_pendente();

DROP TRIGGER IF EXISTS b16_proteger_remocao_senha_temporaria_pendente
  ON public.responsaveis_legais;
CREATE TRIGGER b16_proteger_remocao_senha_temporaria_pendente
BEFORE DELETE ON public.responsaveis_legais
FOR EACH ROW
EXECUTE FUNCTION public.proteger_remocao_senha_temporaria_pendente();

REVOKE ALL ON FUNCTION public.proteger_remocao_senha_temporaria_pendente()
  FROM PUBLIC, anon, authenticated, service_role;

-- A senha é global ao auth.users. Uma emissão em um perfil não pode competir
-- com outra emissão ativa da mesma identidade em outro perfil. O advisory lock
-- fecha a corrida entre transações sem bloquear leituras normais dos portais.
CREATE OR REPLACE FUNCTION public.impedir_colisao_senha_temporaria_entre_perfis()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.auth_user_id IS NULL
     OR NEW.senha_temporaria_emissao_id IS NULL
     OR NEW.senha_temporaria_emissao_iniciada_em IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'parceiros'
     AND upper(coalesce(NEW.tipo, '')) <> 'ALUNO' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'portal-temporary-password-auth:' || NEW.auth_user_id::text,
      0
    )
  );

  IF TG_TABLE_NAME = 'parceiros' THEN
    IF EXISTS (
      SELECT 1
      FROM public.responsaveis_legais AS responsavel
      WHERE responsavel.auth_user_id = NEW.auth_user_id
        AND responsavel.senha_temporaria_emissao_id IS NOT NULL
        AND responsavel.senha_temporaria_emissao_iniciada_em IS NOT NULL
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_OUTRO_PERFIL_ATIVA';
    END IF;
  ELSIF TG_TABLE_NAME = 'responsaveis_legais' THEN
    IF EXISTS (
      SELECT 1
      FROM public.parceiros AS aluno
      WHERE aluno.auth_user_id = NEW.auth_user_id
        AND upper(coalesce(aluno.tipo, '')) = 'ALUNO'
        AND aluno.senha_temporaria_emissao_id IS NOT NULL
        AND aluno.senha_temporaria_emissao_iniciada_em IS NOT NULL
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_OUTRO_PERFIL_ATIVA';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS b20_impedir_colisao_senha_temporaria_perfil
  ON public.parceiros;
CREATE TRIGGER b20_impedir_colisao_senha_temporaria_perfil
BEFORE INSERT OR UPDATE ON public.parceiros
FOR EACH ROW
EXECUTE FUNCTION public.impedir_colisao_senha_temporaria_entre_perfis();

DROP TRIGGER IF EXISTS b20_impedir_colisao_senha_temporaria_responsavel
  ON public.responsaveis_legais;
CREATE TRIGGER b20_impedir_colisao_senha_temporaria_responsavel
BEFORE INSERT OR UPDATE ON public.responsaveis_legais
FOR EACH ROW
EXECUTE FUNCTION public.impedir_colisao_senha_temporaria_entre_perfis();

REVOKE ALL ON FUNCTION public.impedir_colisao_senha_temporaria_entre_perfis()
  FROM PUBLIC, anon, authenticated, service_role;

-- Mantém os campos anteriores e acrescenta o estado técnico necessário para
-- a Edge reconciliar cada etapa sem ler a tabela diretamente nem expor segredo.
CREATE OR REPLACE FUNCTION public.responsavel_legal_acesso_preparar(
  p_responsavel_legal_id uuid,
  p_actor_auth_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_contexto jsonb;
  v_responsavel public.responsaveis_legais%ROWTYPE;
  v_tem_vinculo_aberto boolean;
  v_tem_vinculo_gerenciavel boolean;
  v_tem_vinculo_verificado_ativo boolean;
  v_bloqueio text;
  v_termos_versao_vigente text :=
    public.portal_identidade_termos_versao_vigente();
  v_termos_aceitos boolean;
  v_requer_troca_senha boolean;
  v_identidade_auth_compartilhada boolean := false;
BEGIN
  v_contexto := public.portal_identidade_exigir_service_role_actor(
    p_actor_auth_user_id
  );

  IF NOT coalesce((v_contexto ->> 'allPolos')::boolean, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'GESTOR_GLOBAL_OU_MATRIZ_OBRIGATORIO';
  END IF;

  IF p_responsavel_legal_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'RESPONSAVEL_LEGAL_ID_OBRIGATORIO';
  END IF;

  SELECT responsavel.*
    INTO v_responsavel
  FROM public.responsaveis_legais AS responsavel
  WHERE responsavel.id = p_responsavel_legal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'RESPONSAVEL_NAO_ENCONTRADO';
  END IF;

  IF v_responsavel.auth_user_id IS NOT NULL THEN
    v_identidade_auth_compartilhada := EXISTS (
      SELECT 1
      FROM public.parceiros AS outro_perfil
      WHERE outro_perfil.auth_user_id = v_responsavel.auth_user_id
    ) OR EXISTS (
      SELECT 1
      FROM public.usuarios_sistema AS usuario_interno
      WHERE usuario_interno.auth_user_id = v_responsavel.auth_user_id
    ) OR EXISTS (
      SELECT 1
      FROM public.responsaveis_legais AS outro_responsavel
      WHERE outro_responsavel.auth_user_id = v_responsavel.auth_user_id
        AND outro_responsavel.id <> v_responsavel.id
    );
  END IF;

  SELECT
    EXISTS (
      SELECT 1
      FROM public.responsaveis_legais_alunos AS vinculo
      WHERE vinculo.responsavel_legal_id = v_responsavel.id
        AND vinculo.status IN ('PENDENTE', 'VERIFICADO')
        AND vinculo.vigente_de <= pg_catalog.statement_timestamp()
        AND (
          vinculo.vigente_ate IS NULL
          OR vinculo.vigente_ate > pg_catalog.statement_timestamp()
        )
    ),
    EXISTS (
      SELECT 1
      FROM public.responsaveis_legais_alunos AS vinculo
      JOIN public.parceiros AS aluno ON aluno.id = vinculo.aluno_id
      WHERE vinculo.responsavel_legal_id = v_responsavel.id
        AND vinculo.status IN ('PENDENTE', 'VERIFICADO')
        AND vinculo.vigente_de <= pg_catalog.statement_timestamp()
        AND (
          vinculo.vigente_ate IS NULL
          OR vinculo.vigente_ate > pg_catalog.statement_timestamp()
        )
        AND upper(aluno.tipo) = 'ALUNO'
        AND public.portal_identidade_actor_pode_gerir_aluno(v_contexto, aluno.id)
    ),
    EXISTS (
      SELECT 1
      FROM public.responsaveis_legais_alunos AS vinculo
      JOIN public.parceiros AS aluno ON aluno.id = vinculo.aluno_id
      WHERE vinculo.responsavel_legal_id = v_responsavel.id
        AND vinculo.status = 'VERIFICADO'
        AND vinculo.vigente_de <= pg_catalog.statement_timestamp()
        AND (
          vinculo.vigente_ate IS NULL
          OR vinculo.vigente_ate > pg_catalog.statement_timestamp()
        )
        AND upper(aluno.tipo) = 'ALUNO'
        AND coalesce(public.is_active_status(aluno.status), false)
        AND public.portal_identidade_actor_pode_gerir_aluno(v_contexto, aluno.id)
    )
  INTO
    v_tem_vinculo_aberto,
    v_tem_vinculo_gerenciavel,
    v_tem_vinculo_verificado_ativo;

  IF NOT (
    coalesce((v_contexto ->> 'allPolos')::boolean, false)
    OR v_tem_vinculo_gerenciavel
    OR (
      NOT v_tem_vinculo_aberto
      AND v_responsavel.criado_por = p_actor_auth_user_id
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'RESPONSAVEL_FORA_DO_ESCOPO';
  END IF;

  v_bloqueio := CASE
    WHEN v_responsavel.status <> 'ATIVO' THEN 'STATUS_NAO_ATIVO'
    WHEN v_responsavel.cpf_normalizado IS NULL THEN 'CPF_OBRIGATORIO'
    WHEN v_responsavel.email IS NULL THEN 'EMAIL_OBRIGATORIO'
    WHEN v_responsavel.identidade_verificada_em IS NULL
      THEN 'IDENTIDADE_NAO_VERIFICADA'
    WHEN NOT v_tem_vinculo_verificado_ativo
      THEN 'VINCULO_VERIFICADO_VIGENTE_OBRIGATORIO'
    ELSE NULL
  END;

  v_termos_aceitos := coalesce(v_responsavel.aceitou_termos_uso, false)
    AND v_responsavel.aceitou_termos_uso_em IS NOT NULL
    AND v_responsavel.termos_uso_versao = v_termos_versao_vigente;
  v_requer_troca_senha := v_responsavel.senha_atualizada_em IS NULL
    OR coalesce(v_responsavel.troca_senha_obrigatoria, false)
    OR (
      coalesce(v_responsavel.senha_temporaria_pendente, false)
      AND (
        v_responsavel.senha_temporaria_emitida_em IS NULL
        OR v_responsavel.senha_atualizada_em IS NULL
        OR v_responsavel.senha_atualizada_em <=
          v_responsavel.senha_temporaria_emitida_em
      )
    );

  RETURN pg_catalog.jsonb_build_object(
    'responsavelLegalId', v_responsavel.id,
    'nome', v_responsavel.nome,
    'cpf', v_responsavel.cpf_normalizado,
    'email', v_responsavel.email,
    'status', v_responsavel.status,
    'authUserId', v_responsavel.auth_user_id,
    'eligible', v_bloqueio IS NULL,
    'accessBlockReason', v_bloqueio,
    'emailValidatedByManager',
      v_responsavel.email_validado_gestor_em IS NOT NULL,
    'temporaryPasswordPending',
      coalesce(v_responsavel.senha_temporaria_pendente, false),
    'temporaryPasswordAllowed',
      v_responsavel.auth_user_id IS NOT NULL
      AND NOT v_identidade_auth_compartilhada,
    'temporaryPasswordIssuedAt', v_responsavel.senha_temporaria_emitida_em,
    'passwordUpdatedAt', v_responsavel.senha_atualizada_em,
    'temporaryPasswordIssueId', v_responsavel.senha_temporaria_emissao_id,
    'temporaryPasswordIssueStartedAt',
      v_responsavel.senha_temporaria_emissao_iniciada_em,
    'temporaryPasswordRevokedIssueIds',
      pg_catalog.to_jsonb(coalesce(
        v_responsavel.senha_temporaria_emissoes_revogadas,
        ARRAY[]::uuid[]
      )),
    'requiresPasswordChange', v_requer_troca_senha,
    'termsAccepted', v_termos_aceitos,
    'termsVersion', v_responsavel.termos_uso_versao,
    'currentTermsVersion', v_termos_versao_vigente,
    'firstAccessPending', NOT v_termos_aceitos OR v_requer_troca_senha
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.responsavel_legal_acesso_preparar(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.responsavel_legal_acesso_preparar(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.portal_reservar_reenvio_acesso_responsavel(
  p_responsavel_legal_id uuid,
  p_request_id uuid,
  p_actor_auth_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_preparacao jsonb;
  v_reenvio public.portal_responsavel_reenvios_acesso%ROWTYPE;
  v_responsavel public.responsaveis_legais%ROWTYPE;
  v_gestor_id uuid;
  v_gestor_nome text;
  v_gestor_email text;
BEGIN
  IF p_responsavel_legal_id IS NULL OR p_request_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_REENVIO_RESPONSAVEL_PARAMETROS_INVALIDOS';
  END IF;

  v_preparacao := public.responsavel_legal_acesso_preparar(
    p_responsavel_legal_id,
    p_actor_auth_user_id
  );
  IF NOT coalesce((v_preparacao ->> 'eligible')::boolean, false)
     OR nullif(v_preparacao ->> 'authUserId', '') IS NULL
     OR nullif(v_preparacao ->> 'email', '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_REENVIO_RESPONSAVEL_ACESSO_INELEGIVEL';
  END IF;
  IF NOT coalesce((v_preparacao ->> 'firstAccessPending')::boolean, true) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_REENVIO_RESPONSAVEL_PRIMEIRO_ACESSO_CONCLUIDO';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'portal-responsavel-resend:' || p_actor_auth_user_id::text || ':' ||
        p_request_id::text,
      0
    )
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'portal-responsavel-resend-target:' || p_responsavel_legal_id::text,
      0
    )
  );

  -- Revalida o ator e o cadastro sob a trava idempotente antes de decidir se
  -- uma chamada externa ainda pode ser iniciada.
  v_preparacao := public.responsavel_legal_acesso_preparar(
    p_responsavel_legal_id,
    p_actor_auth_user_id
  );
  IF NOT coalesce((v_preparacao ->> 'eligible')::boolean, false)
     OR nullif(v_preparacao ->> 'authUserId', '') IS NULL
     OR nullif(v_preparacao ->> 'email', '') IS NULL
     OR NOT coalesce((v_preparacao ->> 'firstAccessPending')::boolean, true)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_REENVIO_RESPONSAVEL_ESTADO_ALTERADO';
  END IF;

  -- Uma resposta perdida do provedor não pode bloquear este responsável para
  -- sempre. Durante cinco minutos preservamos at-most-once; depois disso a
  -- reserva ambígua vira falha auditável e o mesmo pedido (ou outro gestor)
  -- pode tentar novamente sob a trava exclusiva do destinatário.
  UPDATE public.portal_responsavel_reenvios_acesso AS reenvio
  SET
    estado = 'FALHOU',
    concluido_em = NULL,
    falhou_em = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.statement_timestamp()
  WHERE reenvio.responsavel_legal_id = p_responsavel_legal_id
    AND reenvio.estado = 'RESERVADO'
    AND reenvio.reservado_em <=
      pg_catalog.clock_timestamp() - interval '5 minutes';

  SELECT reenvio.*
    INTO v_reenvio
  FROM public.portal_responsavel_reenvios_acesso AS reenvio
  WHERE reenvio.actor_auth_user_id = p_actor_auth_user_id
    AND reenvio.request_id = p_request_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_reenvio.responsavel_legal_id IS DISTINCT FROM
       p_responsavel_legal_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'PORTAL_REENVIO_RESPONSAVEL_REQUEST_REPLAY_DIVERGENTE';
    END IF;

    IF v_reenvio.estado = 'ENVIADO' THEN
      RETURN pg_catalog.jsonb_build_object(
        'shouldSend', false,
        'replayed', true,
        'state', 'sent'
      );
    END IF;
    IF v_reenvio.estado = 'RESERVADO' THEN
      RETURN pg_catalog.jsonb_build_object(
        'shouldSend', false,
        'replayed', true,
        'state', 'reserved'
      );
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.portal_responsavel_reenvios_acesso AS outro_reenvio
      WHERE outro_reenvio.responsavel_legal_id = p_responsavel_legal_id
        AND outro_reenvio.estado = 'RESERVADO'
        AND outro_reenvio.id <> v_reenvio.id
    ) THEN
      RETURN pg_catalog.jsonb_build_object(
        'shouldSend', false,
        'replayed', true,
        'state', 'reserved'
      );
    END IF;
    IF v_reenvio.tentativas >= 20 THEN
      RAISE EXCEPTION USING
        ERRCODE = '54000',
        MESSAGE = 'PORTAL_REENVIO_RESPONSAVEL_LIMITE_TENTATIVAS';
    END IF;

    UPDATE public.portal_responsavel_reenvios_acesso AS reenvio
    SET
      estado = 'RESERVADO',
      tentativas = reenvio.tentativas + 1,
      reservado_em = pg_catalog.clock_timestamp(),
      concluido_em = NULL,
      falhou_em = NULL,
      updated_at = pg_catalog.statement_timestamp()
    WHERE reenvio.id = v_reenvio.id;

    RETURN pg_catalog.jsonb_build_object(
      'shouldSend', true,
      'replayed', true,
      'state', 'reserved'
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.portal_responsavel_reenvios_acesso AS outro_reenvio
    WHERE outro_reenvio.responsavel_legal_id = p_responsavel_legal_id
      AND outro_reenvio.estado = 'RESERVADO'
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'shouldSend', false,
      'replayed', true,
      'state', 'reserved'
    );
  END IF;

  SELECT responsavel.*
    INTO v_responsavel
  FROM public.responsaveis_legais AS responsavel
  WHERE responsavel.id = p_responsavel_legal_id;

  SELECT gestor.id, gestor.nome, gestor.email
    INTO v_gestor_id, v_gestor_nome, v_gestor_email
  FROM public.usuarios_sistema AS gestor
  WHERE gestor.auth_user_id = p_actor_auth_user_id
    AND coalesce(public.is_active_status(gestor.status), false)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'GESTOR_PARCEIROS_NAO_AUTORIZADO';
  END IF;

  INSERT INTO public.portal_responsavel_reenvios_acesso (
    actor_auth_user_id,
    request_id,
    responsavel_legal_id
  ) VALUES (
    p_actor_auth_user_id,
    p_request_id,
    p_responsavel_legal_id
  );

  INSERT INTO public.sistema_eventos (
    actor_id,
    actor_nome,
    actor_email,
    actor_tipo,
    pessoa_id,
    pessoa_nome,
    pessoa_tipo,
    polo_id,
    modulo,
    entidade,
    entidade_id,
    acao,
    descricao,
    origem,
    detalhes
  ) VALUES (
    v_gestor_id,
    v_gestor_nome,
    v_gestor_email,
    'Gestor',
    v_responsavel.id,
    v_responsavel.nome,
    'Responsável Legal',
    NULL,
    'Parceiros',
    'responsaveis_legais',
    v_responsavel.id::text,
    'Autorizou reenvio do acesso',
    'Autorizou o envio de nova recuperação ao e-mail verificado do responsável legal.',
    'Aplicativo',
    pg_catalog.jsonb_build_object(
      'delivery', 'recovery_email',
      'requestId', p_request_id
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'shouldSend', true,
    'replayed', false,
    'state', 'reserved'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_concluir_reenvio_acesso_responsavel(
  p_responsavel_legal_id uuid,
  p_request_id uuid,
  p_actor_auth_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_contexto jsonb;
  v_reenvio public.portal_responsavel_reenvios_acesso%ROWTYPE;
BEGIN
  v_contexto := public.portal_identidade_exigir_service_role_actor(
    p_actor_auth_user_id
  );
  IF NOT coalesce((v_contexto ->> 'allPolos')::boolean, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'GESTOR_GLOBAL_OU_MATRIZ_OBRIGATORIO';
  END IF;

  SELECT reenvio.*
    INTO v_reenvio
  FROM public.portal_responsavel_reenvios_acesso AS reenvio
  WHERE reenvio.actor_auth_user_id = p_actor_auth_user_id
    AND reenvio.request_id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR v_reenvio.responsavel_legal_id IS DISTINCT FROM
     p_responsavel_legal_id OR v_reenvio.estado = 'FALHOU' THEN
    RETURN false;
  END IF;
  IF v_reenvio.estado = 'ENVIADO' THEN
    RETURN true;
  END IF;

  UPDATE public.portal_responsavel_reenvios_acesso AS reenvio
  SET
    estado = 'ENVIADO',
    concluido_em = pg_catalog.clock_timestamp(),
    falhou_em = NULL,
    updated_at = pg_catalog.statement_timestamp()
  WHERE reenvio.id = v_reenvio.id;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.portal_cancelar_reenvio_acesso_responsavel(
  p_responsavel_legal_id uuid,
  p_request_id uuid,
  p_actor_auth_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_contexto jsonb;
  v_reenvio public.portal_responsavel_reenvios_acesso%ROWTYPE;
BEGIN
  v_contexto := public.portal_identidade_exigir_service_role_actor(
    p_actor_auth_user_id
  );
  IF NOT coalesce((v_contexto ->> 'allPolos')::boolean, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'GESTOR_GLOBAL_OU_MATRIZ_OBRIGATORIO';
  END IF;

  SELECT reenvio.*
    INTO v_reenvio
  FROM public.portal_responsavel_reenvios_acesso AS reenvio
  WHERE reenvio.actor_auth_user_id = p_actor_auth_user_id
    AND reenvio.request_id = p_request_id
  FOR UPDATE;

  IF NOT FOUND OR v_reenvio.responsavel_legal_id IS DISTINCT FROM
     p_responsavel_legal_id OR v_reenvio.estado = 'ENVIADO' THEN
    RETURN false;
  END IF;
  IF v_reenvio.estado = 'FALHOU' THEN
    RETURN true;
  END IF;

  UPDATE public.portal_responsavel_reenvios_acesso AS reenvio
  SET
    estado = 'FALHOU',
    concluido_em = NULL,
    falhou_em = pg_catalog.clock_timestamp(),
    updated_at = pg_catalog.statement_timestamp()
  WHERE reenvio.id = v_reenvio.id;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_reservar_reenvio_acesso_responsavel(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_concluir_reenvio_acesso_responsavel(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_cancelar_reenvio_acesso_responsavel(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_reservar_reenvio_acesso_responsavel(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_concluir_reenvio_acesso_responsavel(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_cancelar_reenvio_acesso_responsavel(uuid, uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.portal_validar_email_responsavel_por_gestor(
  p_responsavel_legal_id uuid,
  p_actor_auth_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_preparacao jsonb;
  v_responsavel public.responsaveis_legais%ROWTYPE;
  v_auth_email text;
  v_gestor_id uuid;
  v_gestor_nome text;
  v_gestor_email text;
BEGIN
  v_preparacao := public.responsavel_legal_acesso_preparar(
    p_responsavel_legal_id,
    p_actor_auth_user_id
  );
  IF NOT coalesce((v_preparacao ->> 'eligible')::boolean, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'RESPONSAVEL_ACESSO_BLOQUEADO: ' || coalesce(
        v_preparacao ->> 'accessBlockReason',
        'REQUISITOS_INCOMPLETOS'
      );
  END IF;

  SELECT responsavel.*
    INTO v_responsavel
  FROM public.responsaveis_legais AS responsavel
  WHERE responsavel.id = p_responsavel_legal_id
  FOR UPDATE;

  IF NOT FOUND OR v_responsavel.auth_user_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'RESPONSAVEL_ACESSO_AUTH_OBRIGATORIO';
  END IF;

  -- Revalida ator, escopo, vínculo e elegibilidade depois do lock.
  v_preparacao := public.responsavel_legal_acesso_preparar(
    p_responsavel_legal_id,
    p_actor_auth_user_id
  );
  IF NOT coalesce((v_preparacao ->> 'eligible')::boolean, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'RESPONSAVEL_ACESSO_BLOQUEADO: ' || coalesce(
        v_preparacao ->> 'accessBlockReason',
        'REQUISITOS_INCOMPLETOS'
      );
  END IF;

  SELECT lower(btrim(usuario_auth.email))
    INTO v_auth_email
  FROM auth.users AS usuario_auth
  WHERE usuario_auth.id = v_responsavel.auth_user_id;

  IF v_auth_email IS NULL OR v_auth_email IS DISTINCT FROM v_responsavel.email THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'RESPONSAVEL_AUTH_EMAIL_DIVERGENTE';
  END IF;

  IF coalesce((v_preparacao ->> 'firstAccessPending')::boolean, true) = false THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_EMISSAO_SENHA_TEMPORARIA_PRIMEIRO_ACESSO_CONCLUIDO';
  END IF;

  IF v_responsavel.email_validado_gestor_em IS NULL THEN
    SELECT gestor.id, gestor.nome, gestor.email
      INTO v_gestor_id, v_gestor_nome, v_gestor_email
    FROM public.usuarios_sistema AS gestor
    WHERE gestor.auth_user_id = p_actor_auth_user_id
      AND coalesce(public.is_active_status(gestor.status), false)
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'GESTOR_PARCEIROS_NAO_AUTORIZADO';
    END IF;

    UPDATE public.responsaveis_legais AS responsavel
    SET email_validado_gestor_em = pg_catalog.clock_timestamp()
    WHERE responsavel.id = p_responsavel_legal_id;

    INSERT INTO public.sistema_eventos (
      actor_id,
      actor_nome,
      actor_email,
      actor_tipo,
      pessoa_id,
      pessoa_nome,
      pessoa_tipo,
      polo_id,
      modulo,
      entidade,
      entidade_id,
      acao,
      descricao,
      origem,
      detalhes
    )
    VALUES (
      v_gestor_id,
      v_gestor_nome,
      v_gestor_email,
      'Gestor',
      v_responsavel.id,
      v_responsavel.nome,
      'Responsável Legal',
      NULL,
      'Parceiros',
      'responsaveis_legais',
      v_responsavel.id::text,
      'Validou e-mail para acesso assistido',
      'Registrou a validação administrativa da titularidade do e-mail de acesso do responsável legal.',
      'Aplicativo',
      pg_catalog.jsonb_build_object(
        'confirmationMethod',
        'manager_validated_contact'
      )
    );
  END IF;

  RETURN true;
END;
$function$;

-- Mantém integralmente a sincronização canônica do Aluno e acrescenta o
-- Responsável vinculado pelo UUID Auth. Não há fallback do Responsável por
-- e-mail: o vínculo explícito continua sendo a única autoridade.
CREATE OR REPLACE FUNCTION public.sync_aluno_password_reset_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_updated_count integer := 0;
  v_fallback_id uuid;
  v_email_normalizado text;
  v_password_changed boolean := false;
  v_email_confirmation_changed boolean := false;
  v_password_updated_at timestamptz;
BEGIN
  v_password_changed := TG_OP <> 'UPDATE'
    OR OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password;
  v_email_confirmation_changed := TG_OP <> 'UPDATE'
    OR OLD.email_confirmed_at IS DISTINCT FROM NEW.email_confirmed_at;
  v_password_updated_at := CASE
    WHEN v_password_changed THEN pg_catalog.clock_timestamp()
    ELSE NULL
  END;

  IF coalesce(NEW.encrypted_password, '') = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NOT v_password_changed
     AND NOT v_email_confirmation_changed THEN
    RETURN NEW;
  END IF;

  UPDATE public.parceiros AS parceiro
  SET
    senha_atualizada_em = CASE
      WHEN v_password_changed THEN v_password_updated_at
      ELSE parceiro.senha_atualizada_em
    END,
    troca_senha_obrigatoria = CASE
      WHEN NEW.email_confirmed_at IS NULL
        OR (
          coalesce(parceiro.senha_temporaria_pendente, false)
          AND (
            parceiro.senha_temporaria_emitida_em IS NULL
            OR NOT v_password_changed
            OR v_password_updated_at <= parceiro.senha_temporaria_emitida_em
          )
        ) THEN true
      ELSE false
    END,
    acesso_status = CASE
      WHEN NEW.email_confirmed_at IS NULL
        OR (
          coalesce(parceiro.senha_temporaria_pendente, false)
          AND (
            parceiro.senha_temporaria_emitida_em IS NULL
            OR NOT v_password_changed
            OR v_password_updated_at <= parceiro.senha_temporaria_emitida_em
          )
        ) THEN 'pendente'
      ELSE 'ativo'
    END,
    acesso_erro = NULL,
    acesso_ativado_em = CASE
      WHEN NEW.email_confirmed_at IS NULL
        OR (
          coalesce(parceiro.senha_temporaria_pendente, false)
          AND (
            parceiro.senha_temporaria_emitida_em IS NULL
            OR NOT v_password_changed
            OR v_password_updated_at <= parceiro.senha_temporaria_emitida_em
          )
        ) THEN NULL
      ELSE coalesce(
        parceiro.acesso_ativado_em,
        NEW.email_confirmed_at,
        pg_catalog.clock_timestamp()
      )
    END,
    updated_at = pg_catalog.statement_timestamp()
  WHERE upper(coalesce(parceiro.tipo, '')) = 'ALUNO'
    AND parceiro.auth_user_id = NEW.id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  UPDATE public.responsaveis_legais AS responsavel
  SET
    senha_atualizada_em = CASE
      WHEN v_password_changed THEN v_password_updated_at
      ELSE responsavel.senha_atualizada_em
    END,
    troca_senha_obrigatoria = CASE
      WHEN NEW.email_confirmed_at IS NULL
        OR (
          coalesce(responsavel.senha_temporaria_pendente, false)
          AND (
            responsavel.senha_temporaria_emitida_em IS NULL
            OR NOT v_password_changed
            OR v_password_updated_at <=
              responsavel.senha_temporaria_emitida_em
          )
        ) THEN true
      ELSE false
    END
  WHERE responsavel.auth_user_id = NEW.id;

  -- Preserva o fallback legado/canônico do Aluno somente para identidades que
  -- ainda não pertencem a outro perfil. Um convite de Responsável costuma usar
  -- o mesmo e-mail registrado no cadastro do dependente; e-mail isolado jamais
  -- prova que o Auth do responsável também pertence ao Aluno.
  IF v_updated_count > 0
     OR NEW.email IS NULL
     OR EXISTS (
       SELECT 1
       FROM public.responsaveis_legais AS responsavel
       WHERE responsavel.auth_user_id = NEW.id
     )
     OR EXISTS (
       SELECT 1
       FROM public.parceiros AS outro_perfil
       WHERE outro_perfil.auth_user_id = NEW.id
         AND upper(coalesce(outro_perfil.tipo, '')) <> 'ALUNO'
     )
     OR EXISTS (
       SELECT 1
       FROM public.usuarios_sistema AS usuario_interno
       WHERE usuario_interno.auth_user_id = NEW.id
     ) THEN
    RETURN NEW;
  END IF;

  v_email_normalizado := lower(btrim(NEW.email));

  SELECT min(parceiro.id)
    INTO v_fallback_id
  FROM public.parceiros AS parceiro
  WHERE upper(coalesce(parceiro.tipo, '')) = 'ALUNO'
    AND parceiro.auth_user_id IS NULL
    AND lower(
      btrim(
        coalesce(
          nullif(parceiro.auth_login_email, ''),
          nullif(parceiro.email, '')
        )
      )
    ) = v_email_normalizado
  HAVING count(*) = 1;

  IF v_fallback_id IS NOT NULL THEN
    UPDATE public.parceiros AS parceiro
    SET
      auth_user_id = NEW.id,
      senha_atualizada_em = CASE
        WHEN v_password_changed THEN v_password_updated_at
        ELSE parceiro.senha_atualizada_em
      END,
      troca_senha_obrigatoria = CASE
        WHEN NEW.email_confirmed_at IS NULL
          OR (
            coalesce(parceiro.senha_temporaria_pendente, false)
            AND (
              parceiro.senha_temporaria_emitida_em IS NULL
              OR NOT v_password_changed
              OR v_password_updated_at <= parceiro.senha_temporaria_emitida_em
            )
          ) THEN true
        ELSE false
      END,
      acesso_status = CASE
        WHEN NEW.email_confirmed_at IS NULL
          OR (
            coalesce(parceiro.senha_temporaria_pendente, false)
            AND (
              parceiro.senha_temporaria_emitida_em IS NULL
              OR NOT v_password_changed
              OR v_password_updated_at <= parceiro.senha_temporaria_emitida_em
            )
          ) THEN 'pendente'
        ELSE 'ativo'
      END,
      acesso_erro = NULL,
      acesso_ativado_em = CASE
        WHEN NEW.email_confirmed_at IS NULL
          OR (
            coalesce(parceiro.senha_temporaria_pendente, false)
            AND (
              parceiro.senha_temporaria_emitida_em IS NULL
              OR NOT v_password_changed
              OR v_password_updated_at <= parceiro.senha_temporaria_emitida_em
            )
          ) THEN NULL
        ELSE coalesce(
          parceiro.acesso_ativado_em,
          NEW.email_confirmed_at,
          pg_catalog.clock_timestamp()
        )
      END,
      updated_at = pg_catalog.statement_timestamp()
    WHERE parceiro.id = v_fallback_id
      AND parceiro.auth_user_id IS NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_aluno_password_reset_completion ON auth.users;
CREATE TRIGGER trg_sync_aluno_password_reset_completion
AFTER UPDATE OF encrypted_password, email_confirmed_at
ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_aluno_password_reset_completion();

REVOKE ALL ON FUNCTION public.sync_aluno_password_reset_completion()
  FROM PUBLIC, anon, authenticated, service_role;

-- A caixa de assinaturas reutiliza esta função central. O Responsável só pode
-- consultar metadados depois de trocar a senha temporária e aceitar a versão
-- vigente dos termos; esconder a tela no cliente não substituiria este gate.
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
    WHEN 'GESTOR' THEN EXISTS (
      SELECT 1
      FROM public.usuarios_sistema AS gestor
      WHERE gestor.id = p_context_id
        AND gestor.auth_user_id = p_actor_auth_user_id
        AND public.is_active_status(gestor.status)
    )
    WHEN 'PROFESSOR' THEN EXISTS (
      SELECT 1
      FROM public.parceiros AS professor
      WHERE professor.id = p_context_id
        AND professor.auth_user_id = p_actor_auth_user_id
        AND upper(professor.tipo) = 'PROFESSOR'
        AND public.is_active_status(professor.status)
    )
    WHEN 'COORDENADOR' THEN EXISTS (
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

REVOKE ALL ON FUNCTION public.assinatura_eletronica_perfil_contexto_valido(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Preserva o corpo endurecido do Aluno com o mesmo payload de idempotência.
-- O dispatcher novo somente acrescenta o Responsável e volta a chamar a
-- função original quando o contexto é de Aluno.
ALTER FUNCTION public.portal_finalizar_primeiro_acesso(uuid, boolean, text, uuid)
  RENAME TO portal_finalizar_primeiro_acesso_aluno_20260821234000;

REVOKE ALL ON FUNCTION public.portal_finalizar_primeiro_acesso_aluno_20260821234000(uuid, boolean, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.portal_finalizar_primeiro_acesso(
  p_context_id uuid,
  p_aceitar_termos boolean,
  p_termos_versao text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_termos_versao_vigente text :=
    public.portal_identidade_termos_versao_vigente();
  v_contexto_aluno boolean;
  v_contexto_responsavel boolean;
  v_payload_sha256 text;
  v_replay jsonb;
  v_responsavel public.responsaveis_legais%ROWTYPE;
  v_aceite_em timestamptz;
  v_resultado jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'AUTENTICACAO_OBRIGATORIA';
  END IF;

  IF p_context_id IS NULL OR p_request_id IS NULL
     OR nullif(btrim(coalesce(p_termos_versao, '')), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_PRIMEIRO_ACESSO_PARAMETROS_INVALIDOS';
  END IF;

  IF p_aceitar_termos IS DISTINCT FROM true THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_PRIMEIRO_ACESSO_TERMOS_NAO_ACEITOS';
  END IF;

  IF btrim(p_termos_versao) IS DISTINCT FROM v_termos_versao_vigente THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'PORTAL_PRIMEIRO_ACESSO_TERMOS_VERSAO_DIVERGENTE';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.parceiros AS aluno
    WHERE aluno.id = p_context_id
      AND aluno.auth_user_id = v_actor
      AND upper(aluno.tipo) = 'ALUNO'
      AND coalesce(public.is_active_status(aluno.status), false)
  )
    INTO v_contexto_aluno;

  SELECT EXISTS (
    SELECT 1
    FROM public.responsaveis_legais AS responsavel
    WHERE responsavel.id = p_context_id
      AND responsavel.auth_user_id = v_actor
      AND responsavel.status = 'ATIVO'
      AND EXISTS (
        SELECT 1
        FROM public.responsaveis_legais_alunos AS vinculo
        JOIN public.parceiros AS aluno ON aluno.id = vinculo.aluno_id
        WHERE vinculo.responsavel_legal_id = responsavel.id
          AND vinculo.status = 'VERIFICADO'
          AND vinculo.vigente_de <= pg_catalog.statement_timestamp()
          AND (
            vinculo.vigente_ate IS NULL
            OR vinculo.vigente_ate > pg_catalog.statement_timestamp()
          )
          AND upper(aluno.tipo) = 'ALUNO'
          AND coalesce(public.is_active_status(aluno.status), false)
      )
  )
    INTO v_contexto_responsavel;

  IF v_contexto_aluno AND v_contexto_responsavel THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PORTAL_PRIMEIRO_ACESSO_CONTEXTO_AMBIGUO';
  END IF;

  IF v_contexto_aluno THEN
    RETURN public.portal_finalizar_primeiro_acesso_aluno_20260821234000(
      p_context_id,
      p_aceitar_termos,
      p_termos_versao,
      p_request_id
    );
  END IF;

  IF NOT v_contexto_responsavel THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PORTAL_PRIMEIRO_ACESSO_CONTEXTO_NAO_AUTORIZADO';
  END IF;

  -- O formato permanece idêntico ao Aluno, preservando a semântica do ledger.
  v_payload_sha256 := public.portal_identidade_payload_sha256(
    pg_catalog.jsonb_build_object(
      'contextId', p_context_id,
      'aceitarTermos', true,
      'termosVersao', v_termos_versao_vigente
    )
  );
  v_replay := public.portal_identidade_obter_replay(
    v_actor,
    p_request_id,
    'PRIMEIRO_ACESSO_FINALIZAR',
    v_payload_sha256
  );

  SELECT responsavel.*
    INTO v_responsavel
  FROM public.responsaveis_legais AS responsavel
  WHERE responsavel.id = p_context_id
    AND responsavel.auth_user_id = v_actor
    AND responsavel.status = 'ATIVO'
  FOR UPDATE;

  IF NOT FOUND OR NOT EXISTS (
    SELECT 1
    FROM public.responsaveis_legais_alunos AS vinculo
    JOIN public.parceiros AS aluno ON aluno.id = vinculo.aluno_id
    WHERE vinculo.responsavel_legal_id = v_responsavel.id
      AND vinculo.status = 'VERIFICADO'
      AND vinculo.vigente_de <= pg_catalog.statement_timestamp()
      AND (
        vinculo.vigente_ate IS NULL
        OR vinculo.vigente_ate > pg_catalog.statement_timestamp()
      )
      AND upper(aluno.tipo) = 'ALUNO'
      AND coalesce(public.is_active_status(aluno.status), false)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PORTAL_PRIMEIRO_ACESSO_CONTEXTO_NAO_AUTORIZADO';
  END IF;

  IF v_responsavel.senha_atualizada_em IS NULL
     OR coalesce(v_responsavel.troca_senha_obrigatoria, false)
     OR (
       coalesce(v_responsavel.senha_temporaria_pendente, false)
       AND (
         v_responsavel.senha_temporaria_emitida_em IS NULL
         OR v_responsavel.senha_atualizada_em IS NULL
         OR v_responsavel.senha_atualizada_em <=
           v_responsavel.senha_temporaria_emitida_em
       )
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'PORTAL_PRIMEIRO_ACESSO_SENHA_AINDA_OBRIGATORIA';
  END IF;

  -- Replay não contorna uma reativação do primeiro acesso nem vínculo revogado.
  IF v_replay IS NOT NULL THEN
    RETURN v_replay;
  END IF;

  IF coalesce(v_responsavel.aceitou_termos_uso, false)
     AND v_responsavel.aceitou_termos_uso_em IS NOT NULL
     AND v_responsavel.termos_uso_versao = v_termos_versao_vigente THEN
    v_aceite_em := v_responsavel.aceitou_termos_uso_em;

    UPDATE public.responsaveis_legais AS responsavel
    SET
      senha_temporaria_pendente = false,
      senha_temporaria_emissao_id = NULL,
      senha_temporaria_emissao_iniciada_em = NULL,
      senha_temporaria_emissao_senha_alterada_em = NULL
    WHERE responsavel.id = p_context_id;
  ELSE
    v_aceite_em := pg_catalog.clock_timestamp();

    UPDATE public.responsaveis_legais AS responsavel
    SET
      aceitou_termos_uso = true,
      aceitou_termos_uso_em = v_aceite_em,
      termos_uso_versao = v_termos_versao_vigente,
      senha_temporaria_pendente = false,
      senha_temporaria_emissao_id = NULL,
      senha_temporaria_emissao_iniciada_em = NULL,
      senha_temporaria_emissao_senha_alterada_em = NULL
    WHERE responsavel.id = p_context_id;
  END IF;

  v_resultado := pg_catalog.jsonb_build_object(
    'contextId', p_context_id,
    'firstAccess', pg_catalog.jsonb_build_object(
      'acceptedTermsAt', v_aceite_em,
      'acceptedTermsVersion', v_termos_versao_vigente,
      'requiresPasswordReset', false
    )
  );

  RETURN public.portal_identidade_registrar_operacao(
    v_actor,
    p_request_id,
    'PRIMEIRO_ACESSO_FINALIZAR',
    v_payload_sha256,
    v_resultado
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_finalizar_primeiro_acesso(uuid, boolean, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_finalizar_primeiro_acesso(uuid, boolean, text, uuid)
  TO authenticated;

-- Encapsula a versão anterior para alterar apenas o firstAccess do Responsável.
-- Todos os demais perfis, escopos e prioridades continuam sendo produzidos pelo
-- corpo já testado na migration do Aluno.
ALTER FUNCTION public.portal_listar_perfis()
  RENAME TO portal_listar_perfis_base_20260821234000;

REVOKE ALL ON FUNCTION public.portal_listar_perfis_base_20260821234000()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.portal_listar_perfis()
RETURNS TABLE (
  role text,
  "contextId" uuid,
  label text,
  "homeRoute" text,
  capabilities text[],
  "poloIds" uuid[],
  "allPolos" boolean,
  "requiresPoloSelection" boolean,
  scopes jsonb,
  "firstAccess" jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_termos_versao_vigente text :=
    public.portal_identidade_termos_versao_vigente();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'AUTENTICACAO_OBRIGATORIA';
  END IF;

  RETURN QUERY
  SELECT
    perfil.role,
    perfil."contextId",
    perfil.label,
    perfil."homeRoute",
    perfil.capabilities,
    perfil."poloIds",
    perfil."allPolos",
    perfil."requiresPoloSelection",
    perfil.scopes,
    CASE
      WHEN perfil.role = 'RESPONSAVEL_LEGAL' THEN (
        SELECT pg_catalog.jsonb_build_object(
          'acceptedTermsAt', CASE
            WHEN coalesce(responsavel.aceitou_termos_uso, false)
              AND responsavel.termos_uso_versao = v_termos_versao_vigente
              THEN responsavel.aceitou_termos_uso_em
            ELSE NULL
          END,
          'acceptedTermsVersion', CASE
            WHEN coalesce(responsavel.aceitou_termos_uso, false)
              AND responsavel.termos_uso_versao = v_termos_versao_vigente
              THEN responsavel.termos_uso_versao
            ELSE NULL
          END,
          'requiresPasswordReset', (
            responsavel.senha_atualizada_em IS NULL
            OR coalesce(responsavel.troca_senha_obrigatoria, false)
            OR (
              coalesce(responsavel.senha_temporaria_pendente, false)
              AND (
                responsavel.senha_temporaria_emitida_em IS NULL
                OR responsavel.senha_atualizada_em IS NULL
                OR responsavel.senha_atualizada_em <=
                  responsavel.senha_temporaria_emitida_em
              )
            )
          )
        )
        FROM public.responsaveis_legais AS responsavel
        WHERE responsavel.id = perfil."contextId"
          AND responsavel.auth_user_id = v_actor
      )
      ELSE perfil."firstAccess"
    END
  FROM public.portal_listar_perfis_base_20260821234000() AS perfil;
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_listar_perfis()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_listar_perfis()
  TO authenticated;

-- O primeiro acesso não é apenas uma decisão de UI. A própria RPC de dados do
-- Responsável fecha o acesso enquanto senha ou termos estiverem pendentes.
CREATE OR REPLACE FUNCTION public.responsavel_legal_listar_dependentes(
  p_responsavel_legal_id uuid
)
RETURNS TABLE (
  "vinculoId" uuid,
  "alunoId" uuid,
  nome text,
  parentesco text,
  "poloIds" uuid[],
  "vigenteDe" timestamptz,
  "vigenteAte" timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_responsavel public.responsaveis_legais%ROWTYPE;
  v_termos_versao_vigente text :=
    public.portal_identidade_termos_versao_vigente();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'AUTENTICACAO_OBRIGATORIA';
  END IF;

  SELECT responsavel.*
    INTO v_responsavel
  FROM public.responsaveis_legais AS responsavel
  WHERE responsavel.id = p_responsavel_legal_id
    AND responsavel.auth_user_id = v_actor
    AND responsavel.status = 'ATIVO';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PERFIL_RESPONSAVEL_NAO_AUTORIZADO';
  END IF;

  IF v_responsavel.senha_atualizada_em IS NULL
     OR coalesce(v_responsavel.troca_senha_obrigatoria, false)
     OR (
       coalesce(v_responsavel.senha_temporaria_pendente, false)
       AND (
         v_responsavel.senha_temporaria_emitida_em IS NULL
         OR v_responsavel.senha_atualizada_em IS NULL
         OR v_responsavel.senha_atualizada_em <=
           v_responsavel.senha_temporaria_emitida_em
       )
     )
     OR NOT coalesce(v_responsavel.aceitou_termos_uso, false)
     OR v_responsavel.aceitou_termos_uso_em IS NULL
     OR v_responsavel.termos_uso_versao IS DISTINCT FROM
       v_termos_versao_vigente THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'PORTAL_RESPONSAVEL_PRIMEIRO_ACESSO_PENDENTE';
  END IF;

  RETURN QUERY
  SELECT
    vinculo.id,
    aluno.id,
    aluno.nome,
    vinculo.parentesco,
    ARRAY(
      SELECT DISTINCT polo_escopo.polo_id
      FROM pg_catalog.unnest(
        coalesce(aluno.polo_ids, ARRAY[]::uuid[])
        || CASE
          WHEN aluno.polo_id IS NULL THEN ARRAY[]::uuid[]
          ELSE ARRAY[aluno.polo_id]
        END
      ) AS polo_escopo(polo_id)
      WHERE polo_escopo.polo_id IS NOT NULL
      ORDER BY polo_escopo.polo_id
    ),
    vinculo.vigente_de,
    vinculo.vigente_ate
  FROM public.responsaveis_legais_alunos AS vinculo
  JOIN public.parceiros AS aluno ON aluno.id = vinculo.aluno_id
  WHERE vinculo.responsavel_legal_id = p_responsavel_legal_id
    AND vinculo.status = 'VERIFICADO'
    AND vinculo.vigente_de <= pg_catalog.statement_timestamp()
    AND (
      vinculo.vigente_ate IS NULL
      OR vinculo.vigente_ate > pg_catalog.statement_timestamp()
    )
    AND upper(aluno.tipo) = 'ALUNO'
    AND coalesce(public.is_active_status(aluno.status), false)
  ORDER BY aluno.nome, aluno.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.responsavel_legal_listar_dependentes(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.responsavel_legal_listar_dependentes(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.portal_validar_email_responsavel_por_gestor(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_reservar_emissao_senha_temporaria_responsavel(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_concluir_emissao_senha_temporaria_responsavel(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_cancelar_emissao_senha_temporaria_responsavel(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.portal_confirmar_limpeza_emissao_senha_temporaria_responsavel(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.portal_validar_email_responsavel_por_gestor(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_reservar_emissao_senha_temporaria_responsavel(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_concluir_emissao_senha_temporaria_responsavel(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_cancelar_emissao_senha_temporaria_responsavel(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_confirmar_limpeza_emissao_senha_temporaria_responsavel(uuid, uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION public.portal_finalizar_primeiro_acesso(uuid, boolean, text, uuid) IS
  'Finaliza termos do Aluno pelo corpo original ou do Responsável após confirmar troca de senha quando exigida.';
COMMENT ON FUNCTION public.responsavel_legal_acesso_preparar(uuid, uuid) IS
  'Revalida gestor global/matriz, elegibilidade e devolve estado canônico de primeiro acesso do Responsável à Edge.';
COMMENT ON FUNCTION public.portal_validar_email_responsavel_por_gestor(uuid, uuid) IS
  'Registra de forma auditável a validação independente do e-mail do Responsável antes da senha temporária.';
COMMENT ON FUNCTION public.responsavel_legal_listar_dependentes(uuid) IS
  'Lista somente dependentes verificados do próprio Responsável após senha e termos vigentes.';

COMMIT;
