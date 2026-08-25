-- Serializa a exclusao de Gestor com os demais perfis do mesmo UID. O e-mail
-- canonico e usado apenas para linhas legadas que ainda nao possuem vinculo
-- auth_user_id; identidades modernas sao sempre comparadas pelo UUID.

BEGIN;

CREATE OR REPLACE FUNCTION public.proteger_exclusao_usuario_sistema()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_old_email text := lower(nullif(btrim(coalesce(OLD.email, '')), ''));
  v_actor_email text := lower(nullif(
    btrim(coalesce(auth.jwt() ->> 'email', '')),
    ''
  ));
BEGIN
  IF v_old_email IS NOT NULL AND v_old_email = v_actor_email THEN
    RAISE EXCEPTION 'Você não pode excluir o próprio usuário.'
      USING ERRCODE = '42501';
  END IF;

  IF public.usuario_sistema_tem_atividade(OLD.id) THEN
    RAISE EXCEPTION
      'Este usuário possui histórico de atividades e deve ser apenas inativado.'
      USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_proteger_exclusao_usuario_sistema
  ON public.usuarios_sistema;
CREATE TRIGGER trg_proteger_exclusao_usuario_sistema
BEFORE DELETE ON public.usuarios_sistema
FOR EACH ROW
EXECUTE FUNCTION public.proteger_exclusao_usuario_sistema();

-- O cleanup roda somente depois que a linha removida deixou de referenciar o
-- Auth. Assim, ON DELETE SET NULL nunca tenta atualizar a propria tupla que o
-- comando ainda esta excluindo.
CREATE OR REPLACE FUNCTION
  public.delete_gestor_auth_user_on_usuario_sistema_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_auth_user_id uuid := OLD.auth_user_id;
  v_old_email text := lower(nullif(btrim(coalesce(OLD.email, '')), ''));
  v_auth_email text;
BEGIN

  IF v_auth_user_id IS NULL AND v_old_email IS NOT NULL THEN
    SELECT identidade.id
    INTO v_auth_user_id
    FROM auth.users AS identidade
    WHERE lower(nullif(btrim(identidade.email), '')) = v_old_email
    LIMIT 1;
  END IF;

  IF v_auth_user_id IS NULL THEN
    RETURN OLD;
  END IF;

  IF NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'portal-auth-identity:' || v_auth_user_id::text,
      0
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PORTAL_IDENTIDADE_VINCULO_CONCORRENTE';
  END IF;

  SELECT lower(nullif(btrim(identidade.email), ''))
  INTO v_auth_email
  FROM auth.users AS identidade
  WHERE identidade.id = v_auth_user_id;

  IF NOT FOUND THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.usuarios_sistema AS outro_gestor
    WHERE (
        outro_gestor.auth_user_id = v_auth_user_id
        OR (
          outro_gestor.auth_user_id IS NULL
          AND v_auth_email IS NOT NULL
          AND lower(nullif(btrim(outro_gestor.email), '')) = v_auth_email
        )
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.parceiros AS parceiro
    WHERE parceiro.auth_user_id = v_auth_user_id
      OR (
        parceiro.auth_user_id IS NULL
        AND v_auth_email IS NOT NULL
        AND lower(coalesce(
          nullif(btrim(parceiro.auth_login_email), ''),
          nullif(btrim(parceiro.email), '')
        )) = v_auth_email
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.responsaveis_legais AS responsavel
    WHERE responsavel.auth_user_id = v_auth_user_id
      OR (
        responsavel.auth_user_id IS NULL
        AND v_auth_email IS NOT NULL
        AND lower(nullif(btrim(responsavel.email), '')) = v_auth_email
      )
  ) THEN
    RETURN OLD;
  END IF;

  DELETE FROM auth.users AS identidade
  WHERE identidade.id = v_auth_user_id;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_delete_gestor_auth_user_on_delete
  ON public.usuarios_sistema;
CREATE TRIGGER trg_delete_gestor_auth_user_on_delete
AFTER DELETE ON public.usuarios_sistema
FOR EACH ROW
EXECUTE FUNCTION
  public.delete_gestor_auth_user_on_usuario_sistema_delete();

-- O Parceiro ja possuia cleanup AFTER. A recriacao explicita congela o timing
-- seguro e prepara a preservacao multipapel antes da migration de ativacao.
CREATE OR REPLACE FUNCTION public.delete_partner_auth_user_on_partner_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_auth_user_id uuid := OLD.auth_user_id;
  v_login_email text := lower(nullif(btrim(coalesce(
    nullif(OLD.auth_login_email, ''),
    nullif(OLD.email, '')
  )), ''));
  v_auth_email text;
BEGIN
  IF OLD.tipo NOT IN ('Aluno', 'Professor') THEN
    RETURN OLD;
  END IF;

  IF v_auth_user_id IS NULL AND v_login_email IS NOT NULL THEN
    SELECT auth_user.id
    INTO v_auth_user_id
    FROM auth.users AS auth_user
    WHERE lower(btrim(auth_user.email)) = v_login_email
    LIMIT 1;
  END IF;

  IF v_auth_user_id IS NULL THEN
    RETURN OLD;
  END IF;

  IF NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'portal-auth-identity:' || v_auth_user_id::text,
      0
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PORTAL_IDENTIDADE_VINCULO_CONCORRENTE';
  END IF;

  SELECT lower(nullif(btrim(auth_user.email), ''))
  INTO v_auth_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = v_auth_user_id;

  IF NOT FOUND THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.parceiros AS parceiro
    WHERE parceiro.auth_user_id = v_auth_user_id
      OR (
        parceiro.auth_user_id IS NULL
        AND v_auth_email IS NOT NULL
        AND lower(btrim(coalesce(
          nullif(parceiro.auth_login_email, ''),
          nullif(parceiro.email, '')
        ))) = v_auth_email
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.usuarios_sistema AS gestor
    WHERE gestor.auth_user_id = v_auth_user_id
      OR (
        gestor.auth_user_id IS NULL
        AND v_auth_email IS NOT NULL
        AND lower(btrim(gestor.email)) = v_auth_email
        AND public.is_active_status(gestor.status)
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.responsaveis_legais AS responsavel
    WHERE responsavel.auth_user_id = v_auth_user_id
      OR (
        responsavel.auth_user_id IS NULL
        AND v_auth_email IS NOT NULL
        AND lower(nullif(btrim(responsavel.email), '')) = v_auth_email
      )
  ) THEN
    RETURN OLD;
  END IF;

  DELETE FROM auth.users AS auth_user
  WHERE auth_user.id = v_auth_user_id;

  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_delete_partner_auth_user_on_partner_delete
  ON public.parceiros;
CREATE TRIGGER trg_delete_partner_auth_user_on_partner_delete
AFTER DELETE ON public.parceiros
FOR EACH ROW
EXECUTE FUNCTION public.delete_partner_auth_user_on_partner_delete();

REVOKE ALL ON FUNCTION public.proteger_exclusao_usuario_sistema()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proteger_exclusao_usuario_sistema()
  TO service_role;
REVOKE ALL ON FUNCTION
  public.delete_gestor_auth_user_on_usuario_sistema_delete()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.delete_gestor_auth_user_on_usuario_sistema_delete()
  TO service_role;
REVOKE ALL ON FUNCTION public.delete_partner_auth_user_on_partner_delete()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_partner_auth_user_on_partner_delete()
  TO service_role;

COMMIT;
