-- Mantem o e-mail canonico sincronizado em todos os papeis que compartilham
-- a mesma identidade Auth. A validacao ativada ao fim do lote enxerga o estado
-- final porque seus triggers sao adiados.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_gestor_email_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_previous_sync_marker text := '';
  v_sync_marker_installed boolean := false;
BEGIN
  IF NEW.email IS NOT DISTINCT FROM OLD.email THEN
    RETURN NEW;
  END IF;

  IF NEW.email IS NULL THEN
    IF NOT pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'portal-auth-identity:' || NEW.id::text,
        0
      )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '40001',
        MESSAGE = 'PORTAL_IDENTIDADE_VINCULO_CONCORRENTE';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.usuarios_sistema
      WHERE auth_user_id = NEW.id
    ) OR EXISTS (
      SELECT 1 FROM public.parceiros
      WHERE auth_user_id = NEW.id
    ) OR EXISTS (
      SELECT 1 FROM public.responsaveis_legais
      WHERE auth_user_id = NEW.id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PORTAL_IDENTIDADE_AUTH_EMAIL_OBRIGATORIO';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.email IS NOT NULL THEN
    v_previous_sync_marker := coalesce(
      pg_catalog.current_setting('app.syncing_auth_email', true),
      ''
    );
    PERFORM pg_catalog.set_config('app.syncing_auth_email', 'true', true);
    v_sync_marker_installed := true;

    UPDATE public.usuarios_sistema
    SET email = lower(NEW.email)
    WHERE auth_user_id = NEW.id;

    UPDATE public.parceiros
    SET
      email = CASE
        WHEN OLD.email IS NOT NULL AND lower(email) = lower(OLD.email)
          THEN lower(NEW.email)
        ELSE email
      END,
      auth_login_email = lower(NEW.email)
    WHERE auth_user_id = NEW.id;

    UPDATE public.responsaveis_legais
    SET
      email = lower(NEW.email),
      updated_at = pg_catalog.statement_timestamp()
    WHERE auth_user_id = NEW.id
      AND email IS DISTINCT FROM lower(NEW.email);
  END IF;

  IF v_sync_marker_installed THEN
    PERFORM pg_catalog.set_config(
      'app.syncing_auth_email',
      v_previous_sync_marker,
      true
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  IF v_sync_marker_installed THEN
    PERFORM pg_catalog.set_config(
      'app.syncing_auth_email',
      v_previous_sync_marker,
      true
    );
  END IF;
  RAISE;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_gestor_email_from_auth()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_gestor_email_from_auth()
  TO service_role;

COMMIT;
