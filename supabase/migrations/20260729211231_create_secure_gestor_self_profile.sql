-- Meu Perfil do portal Gestor.
-- Mantém dados pessoais fora do módulo Configurações e limita cada usuário
-- autenticado ao próprio cadastro e ao próprio avatar.

ALTER TABLE public.usuarios_sistema
  ADD COLUMN IF NOT EXISTS foto_path text;

COMMENT ON COLUMN public.usuarios_sistema.foto_path IS
  'Caminho privado do avatar do gestor no bucket avatares-perfil.';

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'avatares-perfil',
  'avatares-perfil',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "avatares_perfil_select_own" ON storage.objects;
CREATE POLICY "avatares_perfil_select_own"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'avatares-perfil'
    AND public.is_gestor()
    AND name = (auth.uid()::text || '/avatar')
  );

DROP POLICY IF EXISTS "avatares_perfil_insert_own" ON storage.objects;
CREATE POLICY "avatares_perfil_insert_own"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatares-perfil'
    AND public.is_gestor()
    AND name = (auth.uid()::text || '/avatar')
  );

DROP POLICY IF EXISTS "avatares_perfil_update_own" ON storage.objects;
CREATE POLICY "avatares_perfil_update_own"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatares-perfil'
    AND public.is_gestor()
    AND name = (auth.uid()::text || '/avatar')
  )
  WITH CHECK (
    bucket_id = 'avatares-perfil'
    AND public.is_gestor()
    AND name = (auth.uid()::text || '/avatar')
  );

DROP POLICY IF EXISTS "avatares_perfil_delete_own" ON storage.objects;
CREATE POLICY "avatares_perfil_delete_own"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatares-perfil'
    AND public.is_gestor()
    AND name = (auth.uid()::text || '/avatar')
  );

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
  v_auth_email text := lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''));
  v_nome text := btrim(coalesce(p_nome, ''));
  v_telefone text := nullif(btrim(coalesce(p_telefone, '')), '');
  v_expected_avatar_path text := auth.uid()::text || '/avatar';
BEGIN
  IF auth.uid() IS NULL OR v_auth_email IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida. Entre novamente para alterar seu perfil.'
      USING ERRCODE = '42501';
  END IF;

  IF char_length(v_nome) < 3 OR char_length(v_nome) > 120 THEN
    RAISE EXCEPTION 'Informe um nome entre 3 e 120 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  IF v_telefone IS NOT NULL AND char_length(v_telefone) > 24 THEN
    RAISE EXCEPTION 'O telefone informado é inválido.'
      USING ERRCODE = '22023';
  END IF;

  IF p_foto_path IS NOT NULL AND p_foto_path <> v_expected_avatar_path THEN
    RAISE EXCEPTION 'O caminho da foto não pertence ao usuário autenticado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.usuarios_sistema AS usuario
  SET
    nome = v_nome,
    telefone = v_telefone,
    foto_path = p_foto_path
  WHERE lower(usuario.email) = v_auth_email
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

REVOKE ALL ON FUNCTION public.salvar_meu_perfil_gestor(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.salvar_meu_perfil_gestor(text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.salvar_meu_perfil_gestor(text, text, text) TO authenticated;

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
    WHERE lower(email) = lower(OLD.email);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_gestor_email_from_auth() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_gestor_email_from_auth() FROM anon;
REVOKE ALL ON FUNCTION public.sync_gestor_email_from_auth() FROM authenticated;

DROP TRIGGER IF EXISTS trg_sync_gestor_email_from_auth ON auth.users;
CREATE TRIGGER trg_sync_gestor_email_from_auth
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_gestor_email_from_auth();
