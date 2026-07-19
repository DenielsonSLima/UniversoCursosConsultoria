BEGIN;

ALTER TABLE public.comunicacao_mensagens
  ADD COLUMN IF NOT EXISTS anexo_path text;

COMMENT ON COLUMN public.comunicacao_mensagens.anexo_path IS
  'Path interno no bucket privado anexos. anexo_url permanece apenas para compatibilidade legada.';

UPDATE storage.buckets
SET public = false,
    allowed_mime_types = array_remove(allowed_mime_types, 'image/svg+xml')
WHERE id = 'anexos';

ALTER TABLE public.comunicacao_mensagens
  DROP CONSTRAINT IF EXISTS comunicacao_mensagens_anexo_path_chat_check;
ALTER TABLE public.comunicacao_mensagens
  ADD CONSTRAINT comunicacao_mensagens_anexo_path_chat_check
  CHECK (
    anexo_path IS NULL
    OR anexo_path LIKE 'comunicacao/chats/' || chat_id::text || '/%'
  );

CREATE OR REPLACE FUNCTION public.can_upload_anexo_storage_object(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_chat_id uuid;
  v_actor_type text;
  v_actor_id text;
BEGIN
  IF split_part(p_name, '/', 1) <> 'comunicacao'
    OR split_part(p_name, '/', 2) <> 'chats'
    OR split_part(p_name, '/', 3) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;

  v_chat_id := split_part(p_name, '/', 3)::uuid;
  v_actor_type := split_part(p_name, '/', 4);
  v_actor_id := split_part(p_name, '/', 5);

  IF NOT EXISTS (
    SELECT 1
    FROM public.comunicacao_chats c
    WHERE c.id = v_chat_id
      AND (
        c.remetente_id = public.current_aluno_id()
        OR c.remetente_id = public.current_professor_id()
        OR public.gestor_has_tab('comunicacao', 'comunicacao-mensagem')
      )
  ) THEN
    RETURN false;
  END IF;

  RETURN CASE v_actor_type
    WHEN 'aluno' THEN
      v_actor_id = coalesce(public.current_aluno_id()::text, '')
    WHEN 'professor' THEN
      v_actor_id = coalesce(public.current_professor_id()::text, '')
    WHEN 'gestor' THEN
      public.gestor_has_tab('comunicacao', 'comunicacao-mensagem')
    ELSE false
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_read_anexo_storage_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.comunicacao_mensagens mensagem
    JOIN public.comunicacao_chats chat ON chat.id = mensagem.chat_id
    WHERE (
      mensagem.anexo_path = p_name
      OR (
        mensagem.anexo_path IS NULL
        AND mensagem.anexo_url IS NOT NULL
        AND (
          mensagem.anexo_url = p_name
          OR right(mensagem.anexo_url, length('/anexos/' || p_name)) = '/anexos/' || p_name
        )
      )
    )
    AND (
      chat.remetente_id = public.current_aluno_id()
      OR chat.remetente_id = public.current_professor_id()
      OR public.gestor_has_tab('comunicacao', 'comunicacao-mensagem')
    )
  );
$$;

REVOKE ALL ON FUNCTION public.can_upload_anexo_storage_object(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_anexo_storage_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_upload_anexo_storage_object(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_read_anexo_storage_object(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Public comunicacao reads" ON storage.objects;
DROP POLICY IF EXISTS "Public comunicacao uploads" ON storage.objects;
DROP POLICY IF EXISTS "Public comunicacao deletes" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated anexos uploads" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated anexos deletes" ON storage.objects;
DROP POLICY IF EXISTS portal_anexos_select ON storage.objects;
DROP POLICY IF EXISTS portal_anexos_insert ON storage.objects;
DROP POLICY IF EXISTS portal_anexos_update ON storage.objects;
DROP POLICY IF EXISTS portal_anexos_delete ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload object reads" ON storage.objects;

-- Mantém o suporte ao RETURNING dos demais buckets sem deixar o proprietário
-- contornar a regra de participação específica dos anexos de Comunicação.
CREATE POLICY "Authenticated upload object reads"
ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id IN ('documentos', 'biblioteca')
  AND (
    owner = auth.uid()
    OR owner_id = auth.uid()::text
    OR (bucket_id = 'documentos' AND name LIKE 'templates/%')
  )
);

CREATE POLICY portal_anexos_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'anexos'
  AND (
    public.can_read_anexo_storage_object(name)
    OR public.can_upload_anexo_storage_object(name)
  )
);

CREATE POLICY portal_anexos_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'anexos'
  AND public.can_upload_anexo_storage_object(name)
);

CREATE POLICY portal_anexos_update ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'anexos'
  AND owner = auth.uid()
  AND public.can_upload_anexo_storage_object(name)
)
WITH CHECK (
  bucket_id = 'anexos'
  AND owner = auth.uid()
  AND public.can_upload_anexo_storage_object(name)
);

CREATE POLICY portal_anexos_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'anexos'
  AND (
    public.gestor_has_tab('comunicacao', 'comunicacao-mensagem')
    OR (
      owner = auth.uid()
      AND public.can_upload_anexo_storage_object(name)
    )
  )
);

COMMIT;
