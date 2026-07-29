-- Torna auth.uid() a identidade canônica dos portais institucionais.

ALTER TABLE public.parceiros
  ADD COLUMN IF NOT EXISTS auth_user_id uuid
  REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.parceiros AS parceiro
SET auth_user_id = auth_user.id
FROM auth.users AS auth_user
WHERE parceiro.auth_user_id IS NULL
  AND parceiro.auth_login_email IS NOT NULL
  AND lower(btrim(parceiro.auth_login_email)) = lower(btrim(auth_user.email));

UPDATE public.parceiros AS parceiro
SET auth_user_id = auth_user.id
FROM auth.users AS auth_user
WHERE parceiro.auth_user_id IS NULL
  AND parceiro.tipo IN ('Aluno', 'Professor')
  AND lower(btrim(parceiro.email)) = lower(btrim(auth_user.email));

CREATE INDEX IF NOT EXISTS idx_parceiros_auth_user_id
  ON public.parceiros (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.link_parceiro_auth_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_login_email text;
BEGIN
  IF NEW.auth_user_id IS NULL AND NEW.tipo IN ('Aluno', 'Professor') THEN
    v_login_email := coalesce(nullif(btrim(NEW.auth_login_email), ''), nullif(btrim(NEW.email), ''));
    IF v_login_email IS NOT NULL THEN
      SELECT auth_user.id
      INTO NEW.auth_user_id
      FROM auth.users AS auth_user
      WHERE lower(btrim(auth_user.email)) = lower(v_login_email)
      LIMIT 1;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.link_parceiro_auth_identity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_link_parceiro_auth_identity ON public.parceiros;
CREATE TRIGGER trg_link_parceiro_auth_identity
  BEFORE INSERT OR UPDATE OF email, auth_login_email, auth_user_id ON public.parceiros
  FOR EACH ROW
  EXECUTE FUNCTION public.link_parceiro_auth_identity();

CREATE OR REPLACE FUNCTION public.link_usuario_sistema_auth_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.email IS DISTINCT FROM OLD.email
    AND coalesce(current_setting('app.syncing_auth_email', true), 'false') <> 'true'
  THEN
    RAISE EXCEPTION 'O e-mail de acesso deve ser alterado pelo fluxo seguro do Meu Perfil.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.auth_user_id IS NULL THEN
    SELECT auth_user.id
    INTO NEW.auth_user_id
    FROM auth.users AS auth_user
    WHERE lower(btrim(auth_user.email)) = lower(btrim(NEW.email))
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_gestor_email_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email
    AND OLD.email IS NOT NULL
    AND NEW.email IS NOT NULL
  THEN
    PERFORM set_config('app.syncing_auth_email', 'true', true);

    UPDATE public.usuarios_sistema
    SET email = lower(NEW.email)
    WHERE auth_user_id = NEW.id;

    UPDATE public.parceiros
    SET
      email = CASE
        WHEN lower(email) = lower(OLD.email) THEN lower(NEW.email)
        ELSE email
      END,
      auth_login_email = CASE
        WHEN lower(auth_login_email) = lower(OLD.email) THEN lower(NEW.email)
        ELSE auth_login_email
      END
    WHERE auth_user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.gestor_effective_permissions()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_set(
    CASE
      WHEN u.perfil_acesso_id IS NOT NULL
        AND NOT coalesce(u.personalizar_permissoes, false)
        AND p.id IS NOT NULL
        THEN coalesce(p.permissoes, '{}'::jsonb)
      ELSE coalesce(u.permissoes, '{}'::jsonb)
    END,
    '{allPolos}',
    to_jsonb(
      CASE
        WHEN jsonb_typeof(u.permissoes -> 'allPolos') = 'boolean'
          THEN (u.permissoes ->> 'allPolos')::boolean
        ELSE false
      END
    ),
    true
  )
  FROM public.usuarios_sistema u
  LEFT JOIN public.perfis_acesso p ON p.id = u.perfil_acesso_id
  WHERE u.auth_user_id = auth.uid()
    AND public.is_active_status(u.status)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.gestor_effective_schedule()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    u.restricao_horario,
    CASE WHEN u.perfil_acesso_id IS NOT NULL THEN p.restricao_horario ELSE NULL END,
    '{"ativo":false,"dias":[1,2,3,4,5,6],"horario_inicio":"00:00","horario_fim":"23:59"}'::jsonb
  )
  FROM public.usuarios_sistema u
  LEFT JOIN public.perfis_acesso p ON p.id = u.perfil_acesso_id
  WHERE u.auth_user_id = auth.uid()
    AND public.is_active_status(u.status)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_gestor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_sistema u
    WHERE u.auth_user_id = auth.uid()
      AND public.is_active_status(u.status)
  ) AND public.gestor_schedule_allows_access();
$$;

CREATE OR REPLACE FUNCTION public.gestor_allowed_polo_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT public.gestor_schedule_allows_access() THEN ARRAY[]::uuid[]
    WHEN cardinality(coalesce(u.polo_ids, ARRAY[]::uuid[])) > 0 THEN u.polo_ids
    WHEN u.context ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN ARRAY[u.context::uuid]
    ELSE ARRAY[]::uuid[]
  END
  FROM public.usuarios_sistema u
  WHERE u.auth_user_id = auth.uid()
    AND public.is_active_status(u.status)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.gestor_has_all_polos()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.gestor_schedule_allows_access()
    AND coalesce((public.gestor_effective_permissions() ->> 'allPolos')::boolean, false)
    AND cardinality(coalesce(u.polo_ids, ARRAY[]::uuid[])) = 0
  FROM public.usuarios_sistema u
  WHERE u.auth_user_id = auth.uid()
    AND public.is_active_status(u.status)
  LIMIT 1;
$$;

DROP POLICY IF EXISTS portal_usuarios_sistema_select ON public.usuarios_sistema;
CREATE POLICY portal_usuarios_sistema_select
  ON public.usuarios_sistema FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR (public.is_gestor_global() AND public.gestor_has_module('configuracoes'))
  );

DROP POLICY IF EXISTS portal_perfis_acesso_select ON public.perfis_acesso;
CREATE POLICY portal_perfis_acesso_select
  ON public.perfis_acesso FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios_sistema u
      WHERE u.auth_user_id = auth.uid()
        AND public.is_active_status(u.status)
        AND u.perfil_acesso_id = perfis_acesso.id
    )
    OR (public.is_gestor_global() AND public.gestor_has_module('configuracoes'))
  );
