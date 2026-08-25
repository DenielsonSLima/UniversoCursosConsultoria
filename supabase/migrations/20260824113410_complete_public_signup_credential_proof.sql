-- Depois das guardas e constraints multiperfil, completa a prova da senha
-- escolhida no cadastro publico. Convites continuam
-- fora deste caminho: invited_at precisa ser nulo, e CPF/e-mail devem coincidir
-- com o perfil civil canonico vinculado ao mesmo UUID Auth.

BEGIN;

CREATE OR REPLACE FUNCTION
  public.link_public_aluno_auth_partner_after_profile_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_metadata jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  v_origin text := coalesce(v_metadata ->> 'origem', '');
  v_tipo text := upper(coalesce(v_metadata ->> 'tipo', ''));
  v_cpf text := pg_catalog.regexp_replace(
    coalesce(v_metadata ->> 'cpf', ''),
    '[^0-9]',
    '',
    'g'
  );
  v_email text := lower(nullif(btrim(NEW.email), ''));
  v_partner_id uuid;
  v_partner_auth_user_id uuid;
  v_partner_active boolean := false;
  v_partner_temporaria_fenced boolean := true;
  v_linked_partner_id uuid;
  v_auth_ready boolean := NEW.invited_at IS NULL
    AND coalesce(NEW.encrypted_password, '') <> ''
    AND NEW.email_confirmed_at IS NOT NULL
    AND nullif(
      NEW.raw_app_meta_data ->> 'universocc_temporary_password_issue_id',
      ''
    ) IS NULL
    AND nullif(
      NEW.raw_app_meta_data ->> 'universocc_temporary_password_write_nonce',
      ''
    ) IS NULL
    AND nullif(
      NEW.raw_app_meta_data
        ->> 'universocc_responsavel_temporary_password_issue_id',
      ''
    ) IS NULL
    AND nullif(
      NEW.raw_app_meta_data
        ->> 'universocc_responsavel_temporary_password_write_nonce',
      ''
    ) IS NULL;
  v_credential_completed_at timestamptz;
BEGIN
  IF v_origin <> 'cadastro_publico_ead' OR v_tipo <> 'ALUNO' THEN
    RETURN NEW;
  END IF;

  IF v_email IS NULL OR length(v_cpf) <> 11 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CADASTRO_PUBLICO_ALUNO_IDENTIDADE_INVALIDA';
  END IF;

  SELECT
    parceiro.id,
    parceiro.auth_user_id,
    coalesce(public.is_active_status(parceiro.status), false),
    coalesce(parceiro.senha_temporaria_pendente, false)
      OR parceiro.senha_temporaria_emissao_id IS NOT NULL
      OR parceiro.senha_temporaria_emissao_iniciada_em IS NOT NULL
      OR parceiro.senha_temporaria_emissao_senha_alterada_em IS NOT NULL
  INTO
    v_partner_id,
    v_partner_auth_user_id,
    v_partner_active,
    v_partner_temporaria_fenced
  FROM public.parceiros AS parceiro
  WHERE upper(btrim(coalesce(parceiro.tipo, ''))) = 'ALUNO'
    AND pg_catalog.regexp_replace(
      coalesce(parceiro.cpf_cnpj, ''),
      '[^0-9]',
      '',
      'g'
    ) = v_cpf
    AND (
      lower(btrim(coalesce(
        nullif(parceiro.auth_login_email, ''),
        nullif(parceiro.email, ''),
        ''
      ))) = v_email
      OR (TG_OP = 'UPDATE' AND parceiro.auth_user_id = NEW.id)
    )
  ORDER BY
    (parceiro.auth_user_id = NEW.id) DESC,
    parceiro.created_at DESC NULLS LAST,
    parceiro.id
  LIMIT 1
  FOR UPDATE;

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'CADASTRO_PUBLICO_ALUNO_PERFIL_CANONICO_AUSENTE';
  END IF;

  IF v_partner_auth_user_id IS NOT NULL
     AND v_partner_auth_user_id <> NEW.id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'CADASTRO_PUBLICO_ALUNO_IDENTIDADE_JA_VINCULADA';
  END IF;

  v_auth_ready := v_auth_ready
    AND v_partner_active
    AND NOT v_partner_temporaria_fenced;
  v_credential_completed_at := CASE
    WHEN v_auth_ready THEN NEW.email_confirmed_at
    ELSE NULL
  END;

  UPDATE public.parceiros AS parceiro
  SET
    auth_user_id = NEW.id,
    auth_login_email = v_email,
    senha_atualizada_em = CASE
      WHEN v_auth_ready THEN coalesce(
        parceiro.senha_atualizada_em,
        v_credential_completed_at
      )
      ELSE parceiro.senha_atualizada_em
    END,
    troca_senha_obrigatoria = NOT v_auth_ready,
    acesso_status = CASE WHEN v_auth_ready THEN 'ativo' ELSE 'pendente' END,
    acesso_erro = NULL,
    acesso_ativado_em = CASE
      WHEN v_auth_ready THEN coalesce(
        parceiro.acesso_ativado_em,
        v_credential_completed_at
      )
      ELSE NULL
    END,
    updated_at = pg_catalog.statement_timestamp()
  WHERE parceiro.id = v_partner_id
    AND (parceiro.auth_user_id IS NULL OR parceiro.auth_user_id = NEW.id)
  RETURNING parceiro.id INTO v_linked_partner_id;

  IF v_linked_partner_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'CADASTRO_PUBLICO_ALUNO_VINCULO_NAO_CONCLUIDO';
  END IF;

  IF v_auth_ready AND NOT
    public.portal_identidade_credencial_compartilhada_liberada(
      NEW.id,
      NULL,
      NULL
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PORTAL_IDENTIDADE_CREDENCIAL_COMPARTILHADA_ALTERADA';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION
  public.link_public_aluno_auth_partner_after_profile_sync()
IS 'Vincula o signup EAD canonico e registra prova somente da senha propria confirmada.';

REVOKE ALL ON FUNCTION
  public.link_public_aluno_auth_partner_after_profile_sync()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.link_public_aluno_auth_partner_after_profile_sync()
  TO service_role;

-- Repara signups publicos ja confirmados que o fluxo antigo ativava sem gravar
-- a prova central. Uma senha temporaria pendente exclui o UUID do backfill.
CREATE TEMP TABLE portal_public_signup_credential_backfill
ON COMMIT DROP
AS
SELECT DISTINCT
  usuario.id AS auth_user_id,
  pg_catalog.regexp_replace(
    coalesce(usuario.raw_user_meta_data ->> 'cpf', ''),
    '[^0-9]',
    '',
    'g'
  ) AS cpf,
  lower(btrim(usuario.email)) AS email,
  usuario.email_confirmed_at AS credential_completed_at
FROM auth.users AS usuario
JOIN public.parceiros AS aluno
  ON aluno.auth_user_id = usuario.id
 AND upper(btrim(coalesce(aluno.tipo, ''))) = 'ALUNO'
 AND pg_catalog.regexp_replace(
   coalesce(aluno.cpf_cnpj, ''),
   '[^0-9]',
   '',
   'g'
 ) = pg_catalog.regexp_replace(
   coalesce(usuario.raw_user_meta_data ->> 'cpf', ''),
   '[^0-9]',
   '',
   'g'
 )
 AND lower(btrim(coalesce(
   nullif(aluno.auth_login_email, ''),
   nullif(aluno.email, '')
 ))) = lower(btrim(usuario.email))
WHERE usuario.invited_at IS NULL
  AND usuario.email_confirmed_at IS NOT NULL
  AND coalesce(usuario.encrypted_password, '') <> ''
  AND coalesce(usuario.raw_user_meta_data ->> 'origem', '') =
    'cadastro_publico_ead'
  AND upper(coalesce(usuario.raw_user_meta_data ->> 'tipo', '')) = 'ALUNO'
  AND length(pg_catalog.regexp_replace(
    coalesce(usuario.raw_user_meta_data ->> 'cpf', ''),
    '[^0-9]',
    '',
    'g'
  )) = 11
  AND coalesce(public.is_active_status(aluno.status), false)
  AND lower(btrim(coalesce(aluno.acesso_status, ''))) = 'ativo'
  AND NOT coalesce(aluno.troca_senha_obrigatoria, false)
  AND NOT coalesce(aluno.senha_temporaria_pendente, false)
  AND aluno.senha_temporaria_emissao_id IS NULL
  AND aluno.senha_temporaria_emissao_iniciada_em IS NULL
  AND aluno.senha_temporaria_emissao_senha_alterada_em IS NULL
  AND nullif(
    usuario.raw_app_meta_data ->> 'universocc_temporary_password_issue_id',
    ''
  ) IS NULL
  AND nullif(
    usuario.raw_app_meta_data ->> 'universocc_temporary_password_write_nonce',
    ''
  ) IS NULL
  AND nullif(
    usuario.raw_app_meta_data
      ->> 'universocc_responsavel_temporary_password_issue_id',
    ''
  ) IS NULL
  AND nullif(
    usuario.raw_app_meta_data
      ->> 'universocc_responsavel_temporary_password_write_nonce',
    ''
  ) IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.parceiros AS perfil_fenced
    WHERE perfil_fenced.auth_user_id = usuario.id
      AND (
        coalesce(perfil_fenced.senha_temporaria_pendente, false)
        OR perfil_fenced.senha_temporaria_emissao_id IS NOT NULL
        OR perfil_fenced.senha_temporaria_emissao_iniciada_em IS NOT NULL
        OR perfil_fenced.senha_temporaria_emissao_senha_alterada_em IS NOT NULL
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.responsaveis_legais AS responsavel_fenced
    WHERE responsavel_fenced.auth_user_id = usuario.id
      AND (
        coalesce(responsavel_fenced.senha_temporaria_pendente, false)
        OR responsavel_fenced.senha_temporaria_emissao_id IS NOT NULL
        OR responsavel_fenced.senha_temporaria_emissao_iniciada_em IS NOT NULL
        OR responsavel_fenced.senha_temporaria_emissao_senha_alterada_em
          IS NOT NULL
      )
  );

-- As advisories sao obtidas antes de qualquer row lock. Depois delas, cada UID
-- e revalidado em snapshot novo e promovido com o mesmo marcador dos triggers
-- Auth. Concorrentes falham com 40001 nas guardas e nao deixam prova obsoleta.
DO $backfill$
DECLARE
  prova record;
  v_completed_at timestamptz;
  v_previous_marker text := '';
BEGIN
  FOR prova IN
    SELECT candidato.*
    FROM pg_temp.portal_public_signup_credential_backfill AS candidato
    ORDER BY candidato.auth_user_id
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'portal-temporary-password-auth:' || prova.auth_user_id::text,
        0
      )
    );
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'portal-auth-identity:' || prova.auth_user_id::text,
        0
      )
    );

    SELECT usuario.email_confirmed_at
    INTO v_completed_at
    FROM auth.users AS usuario
    JOIN public.parceiros AS aluno
      ON aluno.auth_user_id = usuario.id
     AND upper(btrim(coalesce(aluno.tipo, ''))) = 'ALUNO'
     AND pg_catalog.regexp_replace(
       coalesce(aluno.cpf_cnpj, ''), '[^0-9]', '', 'g'
     ) = prova.cpf
     AND lower(btrim(coalesce(
       nullif(aluno.auth_login_email, ''), nullif(aluno.email, '')
     ))) = prova.email
    WHERE usuario.id = prova.auth_user_id
      AND usuario.invited_at IS NULL
      AND usuario.email_confirmed_at IS NOT NULL
      AND coalesce(usuario.encrypted_password, '') <> ''
      AND coalesce(usuario.raw_user_meta_data ->> 'origem', '') =
        'cadastro_publico_ead'
      AND upper(coalesce(usuario.raw_user_meta_data ->> 'tipo', '')) = 'ALUNO'
      AND pg_catalog.regexp_replace(
        coalesce(usuario.raw_user_meta_data ->> 'cpf', ''), '[^0-9]', '', 'g'
      ) = prova.cpf
      AND lower(btrim(usuario.email)) = prova.email
      AND coalesce(public.is_active_status(aluno.status), false)
      AND lower(btrim(coalesce(aluno.acesso_status, ''))) = 'ativo'
      AND NOT coalesce(aluno.troca_senha_obrigatoria, false)
      AND NOT coalesce(aluno.senha_temporaria_pendente, false)
      AND aluno.senha_temporaria_emissao_id IS NULL
      AND aluno.senha_temporaria_emissao_iniciada_em IS NULL
      AND aluno.senha_temporaria_emissao_senha_alterada_em IS NULL
      AND nullif(
        usuario.raw_app_meta_data ->> 'universocc_temporary_password_issue_id',
        ''
      ) IS NULL
      AND nullif(
        usuario.raw_app_meta_data
          ->> 'universocc_temporary_password_write_nonce',
        ''
      ) IS NULL
      AND nullif(
        usuario.raw_app_meta_data
          ->> 'universocc_responsavel_temporary_password_issue_id',
        ''
      ) IS NULL
      AND nullif(
        usuario.raw_app_meta_data
          ->> 'universocc_responsavel_temporary_password_write_nonce',
        ''
      ) IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.parceiros AS perfil_fenced
        WHERE perfil_fenced.auth_user_id = usuario.id
          AND (
            coalesce(perfil_fenced.senha_temporaria_pendente, false)
            OR perfil_fenced.senha_temporaria_emissao_id IS NOT NULL
            OR perfil_fenced.senha_temporaria_emissao_iniciada_em IS NOT NULL
            OR perfil_fenced.senha_temporaria_emissao_senha_alterada_em
              IS NOT NULL
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.responsaveis_legais AS responsavel_fenced
        WHERE responsavel_fenced.auth_user_id = usuario.id
          AND (
            coalesce(responsavel_fenced.senha_temporaria_pendente, false)
            OR responsavel_fenced.senha_temporaria_emissao_id IS NOT NULL
            OR responsavel_fenced.senha_temporaria_emissao_iniciada_em
              IS NOT NULL
            OR responsavel_fenced.senha_temporaria_emissao_senha_alterada_em
              IS NOT NULL
          )
      )
    LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_previous_marker := coalesce(pg_catalog.current_setting(
      'app.portal_credential_completion_auth_user_id', true
    ), '');
    PERFORM pg_catalog.set_config(
      'app.portal_credential_completion_auth_user_id',
      prova.auth_user_id::text,
      true
    );

    BEGIN
      UPDATE public.parceiros AS aluno
      SET
        senha_atualizada_em = coalesce(aluno.senha_atualizada_em, v_completed_at),
        troca_senha_obrigatoria = false,
        acesso_status = 'ativo',
        acesso_erro = NULL,
        acesso_ativado_em = coalesce(aluno.acesso_ativado_em, v_completed_at),
        updated_at = pg_catalog.statement_timestamp()
      WHERE aluno.auth_user_id = prova.auth_user_id
        AND upper(btrim(coalesce(aluno.tipo, ''))) = 'ALUNO'
        AND pg_catalog.regexp_replace(
          coalesce(aluno.cpf_cnpj, ''), '[^0-9]', '', 'g'
        ) = prova.cpf
        AND lower(btrim(coalesce(
          nullif(aluno.auth_login_email, ''), nullif(aluno.email, '')
        ))) = prova.email;

      INSERT INTO public.portal_identidade_institucional_senha_eventos (
        auth_user_id, senha_alterada_em
      ) VALUES (prova.auth_user_id, v_completed_at)
      ON CONFLICT (auth_user_id) DO UPDATE
      SET senha_alterada_em = GREATEST(
        portal_identidade_institucional_senha_eventos.senha_alterada_em,
        EXCLUDED.senha_alterada_em
      );

      UPDATE public.usuarios_sistema AS gestor
      SET
        primeiro_acesso_institucional_pendente = false,
        senha_institucional_criada_em = v_completed_at,
        acesso_institucional_origem = 'SENHA_CRIADA',
        primeiro_acesso_institucional_operacao_id = NULL
      WHERE gestor.auth_user_id = prova.auth_user_id
        AND (
          gestor.primeiro_acesso_institucional_pendente
          OR gestor.acesso_institucional_origem = 'CONVITE'
        );

      UPDATE public.parceiros AS professor
      SET
        primeiro_acesso_institucional_pendente = false,
        senha_institucional_criada_em = v_completed_at,
        acesso_institucional_origem = 'SENHA_CRIADA',
        primeiro_acesso_institucional_operacao_id = NULL,
        updated_at = pg_catalog.statement_timestamp()
      WHERE professor.auth_user_id = prova.auth_user_id
        AND upper(btrim(coalesce(professor.tipo, ''))) = 'PROFESSOR'
        AND (
          professor.primeiro_acesso_institucional_pendente
          OR professor.acesso_institucional_origem = 'CONVITE'
        );

      UPDATE public.responsaveis_legais AS responsavel
      SET
        senha_atualizada_em = coalesce(
          responsavel.senha_atualizada_em, v_completed_at
        ),
        troca_senha_obrigatoria = false
      WHERE responsavel.auth_user_id = prova.auth_user_id
        AND responsavel.status = 'ATIVO'
        AND pg_catalog.regexp_replace(
          coalesce(responsavel.cpf_normalizado, ''), '[^0-9]', '', 'g'
        ) = prova.cpf
        AND lower(btrim(responsavel.email)) = prova.email;

      IF NOT public.portal_identidade_credencial_compartilhada_liberada(
        prova.auth_user_id, NULL, NULL
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'PORTAL_PUBLIC_SIGNUP_CREDENTIAL_BACKFILL_INCONSISTENTE';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      PERFORM pg_catalog.set_config(
        'app.portal_credential_completion_auth_user_id',
        v_previous_marker,
        true
      );
      RAISE;
    END;

    PERFORM pg_catalog.set_config(
      'app.portal_credential_completion_auth_user_id',
      v_previous_marker,
      true
    );
  END LOOP;
END;
$backfill$;

COMMIT;
