-- Todo vinculo ou troca de UID adquire a mesma trava usada pelas exclusoes.
-- UIDs antigo e novo sao travados em ordem deterministica para evitar inversao
-- entre duas trocas concorrentes de identidade.

BEGIN;

CREATE OR REPLACE FUNCTION public.portal_identidade_lock_antes_vinculo_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_old_auth_user_id uuid;
  v_new_auth_user_id uuid := NEW.auth_user_id;
  v_primeiro uuid;
  v_segundo uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_auth_user_id := OLD.auth_user_id;
  END IF;

  IF v_old_auth_user_id IS NOT NULL
     AND v_new_auth_user_id IS NOT NULL
     AND v_old_auth_user_id IS DISTINCT FROM v_new_auth_user_id THEN
    IF v_old_auth_user_id::text < v_new_auth_user_id::text THEN
      v_primeiro := v_old_auth_user_id;
      v_segundo := v_new_auth_user_id;
    ELSE
      v_primeiro := v_new_auth_user_id;
      v_segundo := v_old_auth_user_id;
    END IF;
  ELSE
    v_primeiro := coalesce(v_new_auth_user_id, v_old_auth_user_id);
  END IF;

  IF v_primeiro IS NOT NULL AND NOT pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'portal-auth-identity:' || v_primeiro::text,
        0
      )
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PORTAL_IDENTIDADE_VINCULO_CONCORRENTE';
  END IF;

  IF v_segundo IS NOT NULL AND NOT pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'portal-auth-identity:' || v_segundo::text,
        0
      )
    ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PORTAL_IDENTIDADE_VINCULO_CONCORRENTE';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS a00_portal_auth_identity_lock
  ON public.parceiros;
DROP TRIGGER IF EXISTS z80_portal_auth_identity_lock
  ON public.parceiros;
CREATE TRIGGER z80_portal_auth_identity_lock
BEFORE INSERT OR UPDATE OF
  auth_user_id, tipo, cpf_cnpj, email, auth_login_email
ON public.parceiros
FOR EACH ROW
EXECUTE FUNCTION public.portal_identidade_lock_antes_vinculo_auth();

DROP TRIGGER IF EXISTS a00_portal_auth_identity_lock
  ON public.usuarios_sistema;
DROP TRIGGER IF EXISTS z80_portal_auth_identity_lock
  ON public.usuarios_sistema;
CREATE TRIGGER z80_portal_auth_identity_lock
BEFORE INSERT OR UPDATE OF auth_user_id, cpf, email
ON public.usuarios_sistema
FOR EACH ROW
EXECUTE FUNCTION public.portal_identidade_lock_antes_vinculo_auth();

DROP TRIGGER IF EXISTS a00_portal_auth_identity_lock
  ON public.responsaveis_legais;
DROP TRIGGER IF EXISTS z80_portal_auth_identity_lock
  ON public.responsaveis_legais;
CREATE TRIGGER z80_portal_auth_identity_lock
BEFORE INSERT OR UPDATE OF auth_user_id, cpf_normalizado, email
ON public.responsaveis_legais
FOR EACH ROW
EXECUTE FUNCTION public.portal_identidade_lock_antes_vinculo_auth();

REVOKE ALL ON FUNCTION public.portal_identidade_lock_antes_vinculo_auth()
  FROM PUBLIC, anon, authenticated, service_role;

-- A mesma migration protege exclusoes antes de instalar os cleanups completos
-- de 13200. Assim nao existe commit intermediario em que vinculo e remocao
-- discordem sobre a chave de serializacao da identidade.
CREATE OR REPLACE FUNCTION public.portal_identidade_lock_antes_exclusao_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_auth_user_id uuid := OLD.auth_user_id;
  v_email text := lower(nullif(btrim(coalesce(
    nullif(pg_catalog.to_jsonb(OLD) ->> 'auth_login_email', ''),
    nullif(pg_catalog.to_jsonb(OLD) ->> 'email', '')
  )), ''));
BEGIN
  IF v_auth_user_id IS NULL AND v_email IS NOT NULL THEN
    SELECT usuario.id
    INTO v_auth_user_id
    FROM auth.users AS usuario
    WHERE lower(nullif(btrim(usuario.email), '')) = v_email
    LIMIT 1;
  END IF;

  IF v_auth_user_id IS NOT NULL AND NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'portal-auth-identity:' || v_auth_user_id::text,
      0
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PORTAL_IDENTIDADE_VINCULO_CONCORRENTE';
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS a00_portal_auth_identity_delete_lock
  ON public.parceiros;
CREATE TRIGGER a00_portal_auth_identity_delete_lock
BEFORE DELETE ON public.parceiros
FOR EACH ROW
EXECUTE FUNCTION public.portal_identidade_lock_antes_exclusao_auth();

DROP TRIGGER IF EXISTS a00_portal_auth_identity_delete_lock
  ON public.usuarios_sistema;
CREATE TRIGGER a00_portal_auth_identity_delete_lock
BEFORE DELETE ON public.usuarios_sistema
FOR EACH ROW
EXECUTE FUNCTION public.portal_identidade_lock_antes_exclusao_auth();

DROP TRIGGER IF EXISTS a00_portal_auth_identity_delete_lock
  ON public.responsaveis_legais;
CREATE TRIGGER a00_portal_auth_identity_delete_lock
BEFORE DELETE ON public.responsaveis_legais
FOR EACH ROW
EXECUTE FUNCTION public.portal_identidade_lock_antes_exclusao_auth();

REVOKE ALL ON FUNCTION public.portal_identidade_lock_antes_exclusao_auth()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
