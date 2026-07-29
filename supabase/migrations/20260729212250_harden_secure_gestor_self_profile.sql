-- Endurece a identidade do Meu Perfil e torna a troca de avatar transacional
-- do ponto de vista do cadastro (novo objeto -> troca do path -> limpeza antiga).

ALTER TABLE public.usuarios_sistema
  ADD COLUMN IF NOT EXISTS auth_user_id uuid
  REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE public.usuarios_sistema AS gestor
SET auth_user_id = auth_user.id
FROM auth.users AS auth_user
WHERE gestor.auth_user_id IS NULL
  AND lower(btrim(gestor.email)) = lower(btrim(auth_user.email));

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_sistema_auth_user_id
  ON public.usuarios_sistema (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_sistema_lower_email
  ON public.usuarios_sistema (lower(btrim(email)));

CREATE OR REPLACE FUNCTION public.link_usuario_sistema_auth_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
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

REVOKE ALL ON FUNCTION public.link_usuario_sistema_auth_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_usuario_sistema_auth_identity() FROM anon;
REVOKE ALL ON FUNCTION public.link_usuario_sistema_auth_identity() FROM authenticated;

DROP TRIGGER IF EXISTS trg_link_usuario_sistema_auth_identity ON public.usuarios_sistema;
CREATE TRIGGER trg_link_usuario_sistema_auth_identity
  BEFORE INSERT OR UPDATE OF email, auth_user_id ON public.usuarios_sistema
  FOR EACH ROW
  EXECUTE FUNCTION public.link_usuario_sistema_auth_identity();

CREATE OR REPLACE FUNCTION public.salvar_meu_perfil_gestor(
  p_nome text,
  p_telefone text,
  p_foto_path text
)
RETURNS TABLE (
  id uuid,
  nome text,
  email text,
  telefone text,
  foto_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_nome text := btrim(coalesce(p_nome, ''));
  v_telefone text := nullif(btrim(coalesce(p_telefone, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida. Entre novamente para alterar seu perfil.'
      USING ERRCODE = '42501';
  END IF;

  IF char_length(v_nome) < 3 OR char_length(v_nome) > 120 THEN
    RAISE EXCEPTION 'Informe um nome entre 3 e 120 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  IF v_telefone IS NULL OR v_telefone !~ '^\([0-9]{2}\) [0-9]{5}-[0-9]{4}$' THEN
    RAISE EXCEPTION 'Informe um celular válido com DDD.'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  UPDATE public.usuarios_sistema AS usuario
  SET
    nome = v_nome,
    telefone = v_telefone
  WHERE usuario.auth_user_id = auth.uid()
    AND lower(usuario.status) = 'ativo'
  RETURNING
    usuario.id,
    usuario.nome,
    usuario.email,
    usuario.telefone,
    usuario.foto_path;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil de gestor ativo não localizado para esta sessão.'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_meu_avatar_gestor(
  p_foto_path text
)
RETURNS TABLE (
  id uuid,
  nome text,
  email text,
  telefone text,
  foto_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida. Entre novamente para alterar sua foto.'
      USING ERRCODE = '42501';
  END IF;

  IF p_foto_path IS NOT NULL
    AND p_foto_path NOT LIKE (auth.uid()::text || '/avatar/%')
  THEN
    RAISE EXCEPTION 'O caminho da foto não pertence ao usuário autenticado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.usuarios_sistema AS usuario
  SET foto_path = p_foto_path
  WHERE usuario.auth_user_id = auth.uid()
    AND lower(usuario.status) = 'ativo'
  RETURNING
    usuario.id,
    usuario.nome,
    usuario.email,
    usuario.telefone,
    usuario.foto_path;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil de gestor ativo não localizado para esta sessão.'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.salvar_meu_avatar_gestor(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.salvar_meu_avatar_gestor(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.salvar_meu_avatar_gestor(text) TO authenticated;

DROP POLICY IF EXISTS "avatares_perfil_select_own" ON storage.objects;
CREATE POLICY "avatares_perfil_select_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatares-perfil'
    AND public.is_gestor()
    AND name LIKE (auth.uid()::text || '/avatar/%')
  );

DROP POLICY IF EXISTS "avatares_perfil_insert_own" ON storage.objects;
CREATE POLICY "avatares_perfil_insert_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatares-perfil'
    AND public.is_gestor()
    AND name LIKE (auth.uid()::text || '/avatar/%')
  );

DROP POLICY IF EXISTS "avatares_perfil_update_own" ON storage.objects;
CREATE POLICY "avatares_perfil_update_own"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatares-perfil'
    AND public.is_gestor()
    AND name LIKE (auth.uid()::text || '/avatar/%')
  )
  WITH CHECK (
    bucket_id = 'avatares-perfil'
    AND public.is_gestor()
    AND name LIKE (auth.uid()::text || '/avatar/%')
  );

DROP POLICY IF EXISTS "avatares_perfil_delete_own" ON storage.objects;
CREATE POLICY "avatares_perfil_delete_own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatares-perfil'
    AND public.is_gestor()
    AND name LIKE (auth.uid()::text || '/avatar/%')
  );

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
    WHERE (
      tipo = 'Professor'
      AND lower(email) = lower(OLD.email)
    ) OR (
      tipo = 'Aluno'
      AND (
        lower(auth_login_email) = lower(OLD.email)
        OR (auth_login_email IS NULL AND lower(email) = lower(OLD.email))
      )
    );
  END IF;

  RETURN NEW;
END;
$$;
