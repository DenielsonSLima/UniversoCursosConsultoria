BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fotos-perfil', 'fotos-perfil', false, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[])
ON CONFLICT (id) DO UPDATE SET public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.profile_photo_partner_id(p_name text)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN p_name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/perfil/[a-z0-9][a-z0-9_.-]*$'
    THEN split_part(p_name, '/', 1)::uuid ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.can_write_private_profile_photo(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.parceiros p
    WHERE p.id = public.profile_photo_partner_id(p_name)
      AND (p.id = public.current_aluno_id() OR p.id = public.current_professor_id()
        OR public.is_partner_in_gestor_scope(p.polo_id, p.polo_ids))
  );
$$;

CREATE OR REPLACE FUNCTION public.can_read_private_profile_photo(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.parceiros p
    WHERE p.id = public.profile_photo_partner_id(p_name)
      AND (p.id = public.current_aluno_id() OR p.id = public.current_professor_id()
        OR public.is_partner_in_gestor_read_scope(p.polo_id, p.polo_ids)
        OR public.can_manage_secretaria_document('carteirinha', p.polo_id)
        OR public.can_manage_secretaria_document('cracha_estagio', p.polo_id))
  );
$$;

REVOKE ALL ON FUNCTION public.profile_photo_partner_id(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write_private_profile_photo(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_private_profile_photo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_photo_partner_id(text),
  public.can_write_private_profile_photo(text), public.can_read_private_profile_photo(text)
  TO authenticated, service_role;

CREATE POLICY fotos_perfil_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'fotos-perfil' AND public.can_read_private_profile_photo(name));
CREATE POLICY fotos_perfil_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'fotos-perfil' AND public.can_write_private_profile_photo(name));
CREATE POLICY fotos_perfil_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'fotos-perfil' AND public.can_write_private_profile_photo(name))
WITH CHECK (bucket_id = 'fotos-perfil' AND public.can_write_private_profile_photo(name));
CREATE POLICY fotos_perfil_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'fotos-perfil' AND public.can_write_private_profile_photo(name));

-- Bloqueia uploads de versões antigas no diretório pessoal do bucket público,
-- preservando logos, imagens de cursos e recursos dos modelos documentais.
CREATE OR REPLACE FUNCTION public.can_mutate_documentos_storage_object(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN p_name LIKE 'templates/%' THEN
      public.gestor_has_tab('cadastros', 'cadastros-modelos')
      OR public.gestor_has_module('configuracoes')
    WHEN p_name LIKE 'logos/%' OR p_name LIKE 'signatures/%' THEN
      public.gestor_has_module('configuracoes')
    WHEN p_name LIKE 'cursos/%' THEN
      public.gestor_has_any_tab('cadastros', ARRAY[
        'cadastros-ead', 'cadastros-especializacao', 'cadastros-livres',
        'cadastros-tecnicos', 'cadastros-superior'
      ])
    ELSE false
  END;
$$;
REVOKE ALL ON FUNCTION public.can_mutate_documentos_storage_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_mutate_documentos_storage_object(text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_private_profile_photo_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_path text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.foto_url IS NOT DISTINCT FROM OLD.foto_url THEN
    RETURN NEW;
  END IF;
  IF NEW.foto_url LIKE 'profile-photo://%' THEN
    v_path := substr(NEW.foto_url, length('profile-photo://') + 1);
    IF public.profile_photo_partner_id(v_path) IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION 'Foto pessoal não pertence ao cadastro.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = 'fotos-perfil' AND o.name = v_path) THEN
      RAISE EXCEPTION 'Foto privada ainda não está disponível.' USING ERRCODE = '22023';
    END IF;
  ELSIF NEW.foto_url ~ '/storage/v1/object/(public/documentos|sign/fotos-perfil)/[^/]+/perfil/' THEN
    RAISE EXCEPTION 'Use a versão atual do portal para salvar a foto privada.'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_private_profile_photo_reference() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_private_profile_photo_reference
BEFORE INSERT OR UPDATE OF foto_url ON public.parceiros
FOR EACH ROW EXECUTE FUNCTION public.guard_private_profile_photo_reference();

COMMENT ON COLUMN public.parceiros.foto_url IS
  'Foto externa autorizada ou referência profile-photo:// ao bucket privado fotos-perfil; URLs assinadas não são persistidas.';

-- Normaliza apenas a referência transitória pública, preservando snapshots
-- e o restante do JSON histórico sem reescrever documentos já emitidos.
CREATE OR REPLACE FUNCTION public.canonical_private_profile_photo(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_value LIKE 'https://kfekgwyqozhicpfuunpo.supabase.co/storage/v1/object/public/documentos/%'
      AND public.profile_photo_partner_id(substr(p_value,
        length('https://kfekgwyqozhicpfuunpo.supabase.co/storage/v1/object/public/documentos/') + 1)) IS NOT NULL
    THEN 'profile-photo://' || substr(p_value,
      length('https://kfekgwyqozhicpfuunpo.supabase.co/storage/v1/object/public/documentos/') + 1)
    ELSE p_value END;
$$;
REVOKE ALL ON FUNCTION public.canonical_private_profile_photo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.canonical_private_profile_photo(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.filtrar_dados_publicos_validacao(p_snapshot jsonb, p_campos text[])
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(jsonb_object_agg(entry.key,
    CASE WHEN entry.key = 'studentPhotoUrl' AND jsonb_typeof(entry.value) = 'string'
      THEN to_jsonb(public.canonical_private_profile_photo(entry.value #>> '{}'))
      ELSE entry.value END), '{}'::jsonb)
  FROM jsonb_each(coalesce(p_snapshot, '{}'::jsonb)) entry
  WHERE entry.key = ANY(coalesce(p_campos, ARRAY[]::text[]));
$$;

COMMIT;
