-- Distingue a conclusao real da credencial global de hashes de convite. A
-- prova pode ser uma troca de senha ou a confirmacao canonica do cadastro
-- publico que ja recebeu a senha escolhida pelo proprio Aluno.

BEGIN;

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
  v_auth_temporary_fenced boolean := false;
  v_profile_temporary_fenced boolean := false;
  v_has_persisted_profile_proof boolean := false;
  v_public_signup_password_ready boolean := false;
  v_persisted_password_ready boolean := false;
  v_confirmation_credential_ready boolean := false;
  v_credential_completed boolean := false;
  v_public_signup_cpf text := '';
  v_password_updated_at timestamptz;
  v_previous_password_marker text := '';
  v_password_marker_installed boolean := false;
BEGIN
  v_password_changed := TG_OP <> 'UPDATE'
    OR OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password;
  v_email_confirmation_changed := TG_OP <> 'UPDATE'
    OR OLD.email_confirmed_at IS DISTINCT FROM NEW.email_confirmed_at;
  v_public_signup_cpf := pg_catalog.regexp_replace(
    coalesce(NEW.raw_user_meta_data ->> 'cpf', ''),
    '[^0-9]',
    '',
    'g'
  );
  v_auth_temporary_fenced := nullif(
    NEW.raw_app_meta_data ->> 'universocc_temporary_password_issue_id',
    ''
  ) IS NOT NULL OR nullif(
    NEW.raw_app_meta_data ->> 'universocc_temporary_password_write_nonce',
    ''
  ) IS NOT NULL OR nullif(
    NEW.raw_app_meta_data
      ->> 'universocc_responsavel_temporary_password_issue_id',
    ''
  ) IS NOT NULL OR nullif(
    NEW.raw_app_meta_data
      ->> 'universocc_responsavel_temporary_password_write_nonce',
    ''
  ) IS NOT NULL;
  v_public_signup_password_ready := TG_OP = 'UPDATE'
    AND NOT v_password_changed
    AND OLD.email_confirmed_at IS NULL
    AND NEW.email_confirmed_at IS NOT NULL
    AND NEW.invited_at IS NULL
    AND coalesce(NEW.encrypted_password, '') <> ''
    AND NOT v_auth_temporary_fenced
    AND coalesce(NEW.raw_user_meta_data ->> 'origem', '') =
      'cadastro_publico_ead'
    AND upper(coalesce(NEW.raw_user_meta_data ->> 'tipo', '')) = 'ALUNO'
    AND length(v_public_signup_cpf) = 11
    AND nullif(lower(btrim(NEW.email)), '') IS NOT NULL;

  -- Metadado isolado nao vira prova. A confirmacao publica precisa apontar
  -- para o perfil civil canonico que ja foi vinculado ao mesmo UUID Auth.
  IF v_public_signup_password_ready THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.parceiros AS aluno_publico
      WHERE aluno_publico.auth_user_id = NEW.id
        AND upper(btrim(coalesce(aluno_publico.tipo, ''))) = 'ALUNO'
        AND coalesce(public.is_active_status(aluno_publico.status), false)
        AND NOT coalesce(aluno_publico.senha_temporaria_pendente, false)
        AND aluno_publico.senha_temporaria_emissao_id IS NULL
        AND aluno_publico.senha_temporaria_emissao_iniciada_em IS NULL
        AND aluno_publico.senha_temporaria_emissao_senha_alterada_em IS NULL
        AND pg_catalog.regexp_replace(
          coalesce(aluno_publico.cpf_cnpj, ''),
          '[^0-9]',
          '',
          'g'
        ) = v_public_signup_cpf
        AND lower(btrim(coalesce(
          nullif(aluno_publico.auth_login_email, ''),
          nullif(aluno_publico.email, '')
        ))) = lower(btrim(NEW.email))
    ) INTO v_public_signup_password_ready;
  END IF;

  -- Uma troca real pode ocorrer antes da confirmacao do e-mail. O ledger do
  -- hash, uma fonte publica persistida e a ausencia total de fences permitem
  -- concluir todos os papeis juntos quando a confirmacao chega depois.
  IF TG_OP = 'UPDATE'
     AND NOT v_password_changed
     AND OLD.email_confirmed_at IS NULL
     AND NEW.email_confirmed_at IS NOT NULL
     AND coalesce(NEW.encrypted_password, '') <> ''
     AND NOT v_auth_temporary_fenced THEN
    SELECT
      coalesce(pg_catalog.bool_or(fonte.senha_atualizada_em IS NOT NULL), false),
      coalesce(pg_catalog.bool_or(fonte.temporaria_fenced), false)
    INTO v_has_persisted_profile_proof, v_profile_temporary_fenced
    FROM (
      SELECT
        aluno.senha_atualizada_em,
        coalesce(aluno.senha_temporaria_pendente, false)
          OR aluno.senha_temporaria_emissao_id IS NOT NULL
          OR aluno.senha_temporaria_emissao_iniciada_em IS NOT NULL
          OR aluno.senha_temporaria_emissao_senha_alterada_em IS NOT NULL
          AS temporaria_fenced
      FROM public.parceiros AS aluno
      WHERE aluno.auth_user_id = NEW.id
        AND upper(btrim(coalesce(aluno.tipo, ''))) = 'ALUNO'
        AND coalesce(public.is_active_status(aluno.status), false)
      UNION ALL
      SELECT
        responsavel.senha_atualizada_em,
        coalesce(responsavel.senha_temporaria_pendente, false)
          OR responsavel.senha_temporaria_emissao_id IS NOT NULL
          OR responsavel.senha_temporaria_emissao_iniciada_em IS NOT NULL
          OR responsavel.senha_temporaria_emissao_senha_alterada_em IS NOT NULL
      FROM public.responsaveis_legais AS responsavel
      WHERE responsavel.auth_user_id = NEW.id
        AND responsavel.status = 'ATIVO'
    ) AS fonte;

    v_persisted_password_ready := v_has_persisted_profile_proof
      AND NOT v_profile_temporary_fenced
      AND EXISTS (
        SELECT 1
        FROM public.portal_identidade_institucional_senha_eventos AS evento
        WHERE evento.auth_user_id = NEW.id
          AND evento.senha_alterada_em IS NOT NULL
          AND (
            NEW.invited_at IS NULL
            OR evento.senha_alterada_em >= NEW.invited_at
          )
      );
  END IF;

  v_confirmation_credential_ready := (
    v_public_signup_password_ready
    OR v_persisted_password_ready
  ) AND NOT v_profile_temporary_fenced;
  v_credential_completed := v_password_changed
    OR v_confirmation_credential_ready;
  v_password_updated_at := CASE
    WHEN v_credential_completed THEN pg_catalog.clock_timestamp()
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

  -- A troca real do hash e a confirmacao canonica do signup sao as duas provas
  -- que podem dispensar a revalidacao aninhada durante esta propagacao.
  IF v_credential_completed THEN
    v_previous_password_marker := coalesce(
      pg_catalog.current_setting(
        'app.portal_credential_completion_auth_user_id',
        true
      ),
      ''
    );
    PERFORM pg_catalog.set_config(
      'app.portal_credential_completion_auth_user_id',
      NEW.id::text,
      true
    );
    v_password_marker_installed := true;
  END IF;

  UPDATE public.parceiros AS parceiro
  SET
    senha_atualizada_em = CASE
      WHEN v_credential_completed THEN v_password_updated_at
      ELSE parceiro.senha_atualizada_em
    END,
    troca_senha_obrigatoria = CASE
      WHEN NEW.email_confirmed_at IS NULL
        OR (NOT v_credential_completed AND parceiro.senha_atualizada_em IS NULL)
        OR (
          coalesce(parceiro.senha_temporaria_pendente, false)
          AND (
            parceiro.senha_temporaria_emitida_em IS NULL
            OR NOT v_credential_completed
            OR v_password_updated_at <= parceiro.senha_temporaria_emitida_em
          )
        ) THEN true
      ELSE false
    END,
    acesso_status = CASE
      WHEN NEW.email_confirmed_at IS NULL
        OR (NOT v_credential_completed AND parceiro.senha_atualizada_em IS NULL)
        OR (
          coalesce(parceiro.senha_temporaria_pendente, false)
          AND (
            parceiro.senha_temporaria_emitida_em IS NULL
            OR NOT v_credential_completed
            OR v_password_updated_at <= parceiro.senha_temporaria_emitida_em
          )
        ) THEN 'pendente'
      ELSE 'ativo'
    END,
    acesso_erro = NULL,
    acesso_ativado_em = CASE
      WHEN NEW.email_confirmed_at IS NULL
        OR (NOT v_credential_completed AND parceiro.senha_atualizada_em IS NULL)
        OR (
          coalesce(parceiro.senha_temporaria_pendente, false)
          AND (
            parceiro.senha_temporaria_emitida_em IS NULL
            OR NOT v_credential_completed
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
    AND parceiro.auth_user_id = NEW.id
    AND (
      NOT v_public_signup_password_ready
      OR (
        pg_catalog.regexp_replace(
          coalesce(parceiro.cpf_cnpj, ''),
          '[^0-9]',
          '',
          'g'
        ) = v_public_signup_cpf
        AND lower(btrim(coalesce(
          nullif(parceiro.auth_login_email, ''),
          nullif(parceiro.email, '')
        ))) = lower(btrim(NEW.email))
      )
    );

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  UPDATE public.responsaveis_legais AS responsavel
  SET
    senha_atualizada_em = CASE
      WHEN v_credential_completed THEN v_password_updated_at
      ELSE responsavel.senha_atualizada_em
    END,
    troca_senha_obrigatoria = CASE
      WHEN NEW.email_confirmed_at IS NULL
        OR (
          NOT v_credential_completed
          AND responsavel.senha_atualizada_em IS NULL
        )
        OR (
          coalesce(responsavel.senha_temporaria_pendente, false)
          AND (
            responsavel.senha_temporaria_emitida_em IS NULL
            OR NOT v_credential_completed
            OR v_password_updated_at <=
              responsavel.senha_temporaria_emitida_em
          )
        ) THEN true
      ELSE false
    END
  WHERE responsavel.auth_user_id = NEW.id
    AND (
      NOT v_public_signup_password_ready
      OR (
        pg_catalog.regexp_replace(
          coalesce(responsavel.cpf_normalizado, ''),
          '[^0-9]',
          '',
          'g'
        ) = v_public_signup_cpf
        AND lower(btrim(responsavel.email)) = lower(btrim(NEW.email))
      )
    );

  -- A confirmacao publica nao altera o hash e, por isso, nao aciona o trigger
  -- institucional legado. A mesma prova global deve liberar Gestor e Professor
  -- ja vinculados, sem deixar uma identidade compartilhada em estado misto.
  IF v_confirmation_credential_ready THEN
    INSERT INTO public.portal_identidade_institucional_senha_eventos (
      auth_user_id,
      senha_alterada_em
    ) VALUES (NEW.id, v_password_updated_at)
    ON CONFLICT (auth_user_id) DO UPDATE
    SET senha_alterada_em = GREATEST(
      portal_identidade_institucional_senha_eventos.senha_alterada_em,
      EXCLUDED.senha_alterada_em
    );

    UPDATE public.usuarios_sistema AS gestor
    SET
      primeiro_acesso_institucional_pendente = false,
      senha_institucional_criada_em = v_password_updated_at,
      acesso_institucional_origem = 'SENHA_CRIADA',
      primeiro_acesso_institucional_operacao_id = NULL
    WHERE gestor.auth_user_id = NEW.id
      AND (
        gestor.primeiro_acesso_institucional_pendente
        OR gestor.acesso_institucional_origem = 'CONVITE'
      );

    UPDATE public.parceiros AS professor
    SET
      primeiro_acesso_institucional_pendente = false,
      senha_institucional_criada_em = v_password_updated_at,
      acesso_institucional_origem = 'SENHA_CRIADA',
      primeiro_acesso_institucional_operacao_id = NULL
    WHERE professor.auth_user_id = NEW.id
      AND upper(btrim(coalesce(professor.tipo, ''))) = 'PROFESSOR'
      AND (
        professor.primeiro_acesso_institucional_pendente
        OR professor.acesso_institucional_origem = 'CONVITE'
      );

    -- Todas as escritas acima pertencem a mesma transacao. A prova canonica
    -- final precisa enxergar o conjunto inteiro pronto; qualquer perfil ainda
    -- pendente reverte a confirmacao em vez de publicar estado misto.
    IF NOT public.portal_identidade_credencial_compartilhada_liberada(
      NEW.id,
      NULL,
      NULL
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '40001',
        MESSAGE = 'PORTAL_IDENTIDADE_CREDENCIAL_COMPARTILHADA_ALTERADA';
    END IF;
  END IF;

  -- Preserva o fallback legado/canonico do Aluno somente para identidades que
  -- ainda nao pertencem a outro perfil. E-mail isolado nunca prova titularidade.
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
    IF v_password_marker_installed THEN
      PERFORM pg_catalog.set_config(
        'app.portal_credential_completion_auth_user_id',
        v_previous_password_marker,
        true
      );
    END IF;
    RETURN NEW;
  END IF;

  v_email_normalizado := lower(btrim(NEW.email));

  SELECT candidato.id
    INTO v_fallback_id
  FROM (
    SELECT
      parceiro.id,
      pg_catalog.count(*) OVER () AS quantidade
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
      AND (
        NOT v_public_signup_password_ready
        OR pg_catalog.regexp_replace(
          coalesce(parceiro.cpf_cnpj, ''),
          '[^0-9]',
          '',
          'g'
        ) = v_public_signup_cpf
      )
  ) AS candidato
  WHERE candidato.quantidade = 1;

  IF v_fallback_id IS NOT NULL THEN
    UPDATE public.parceiros AS parceiro
    SET
      auth_user_id = NEW.id,
      senha_atualizada_em = CASE
        WHEN v_credential_completed THEN v_password_updated_at
        ELSE parceiro.senha_atualizada_em
      END,
      troca_senha_obrigatoria = CASE
        WHEN NEW.email_confirmed_at IS NULL
          OR (NOT v_credential_completed AND parceiro.senha_atualizada_em IS NULL)
          OR (
            coalesce(parceiro.senha_temporaria_pendente, false)
            AND (
              parceiro.senha_temporaria_emitida_em IS NULL
              OR NOT v_credential_completed
              OR v_password_updated_at <= parceiro.senha_temporaria_emitida_em
            )
          ) THEN true
        ELSE false
      END,
      acesso_status = CASE
        WHEN NEW.email_confirmed_at IS NULL
          OR (NOT v_credential_completed AND parceiro.senha_atualizada_em IS NULL)
          OR (
            coalesce(parceiro.senha_temporaria_pendente, false)
            AND (
              parceiro.senha_temporaria_emitida_em IS NULL
              OR NOT v_credential_completed
              OR v_password_updated_at <= parceiro.senha_temporaria_emitida_em
            )
          ) THEN 'pendente'
        ELSE 'ativo'
      END,
      acesso_erro = NULL,
      acesso_ativado_em = CASE
        WHEN NEW.email_confirmed_at IS NULL
          OR (NOT v_credential_completed AND parceiro.senha_atualizada_em IS NULL)
          OR (
            coalesce(parceiro.senha_temporaria_pendente, false)
            AND (
              parceiro.senha_temporaria_emitida_em IS NULL
              OR NOT v_credential_completed
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

  IF v_password_marker_installed THEN
    PERFORM pg_catalog.set_config(
      'app.portal_credential_completion_auth_user_id',
      v_previous_password_marker,
      true
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  IF v_password_marker_installed THEN
      PERFORM pg_catalog.set_config(
        'app.portal_credential_completion_auth_user_id',
        v_previous_password_marker,
        true
    );
  END IF;
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_aluno_password_reset_completion()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
