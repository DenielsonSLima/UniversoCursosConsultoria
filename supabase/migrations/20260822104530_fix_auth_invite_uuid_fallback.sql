-- Corrige a conclusão do convite quando o Auth ainda não possui vínculo interno.
-- PostgreSQL não implementa min(uuid); a falha abortava o /verify com 500 antes
-- que o cliente pudesse receber a sessão e criar a primeira senha.
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
  ) AS candidato
  WHERE candidato.quantidade = 1;

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

REVOKE ALL ON FUNCTION public.sync_aluno_password_reset_completion()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
