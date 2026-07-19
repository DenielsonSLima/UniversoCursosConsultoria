BEGIN;

-- Fase 1, retrocompatível: prepara o schema e aceita os paths antigos e novos.
-- O bucket continua público até o frontend com URLs assinadas ser implantado.
ALTER TABLE public.comunicacao_mensagens
  ADD COLUMN IF NOT EXISTS anexo_path text;

COMMENT ON COLUMN public.comunicacao_mensagens.anexo_path IS
  'Path interno no bucket anexos; usado com URLs assinadas após a fase de privatização.';

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
  -- Compatibilidade temporária com o frontend anterior.
  IF split_part(p_name, '/', 1) = 'comunicacao'
    AND split_part(p_name, '/', 2) <> 'chats' THEN
    RETURN (
      public.current_aluno_id() IS NOT NULL
      AND p_name LIKE 'comunicacao/' || public.current_aluno_id()::text || '/%'
    ) OR (
      public.gestor_has_tab('comunicacao', 'comunicacao-mensagem')
      AND p_name LIKE 'comunicacao/gestor/%'
    );
  END IF;

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

REVOKE ALL ON FUNCTION public.can_upload_anexo_storage_object(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_upload_anexo_storage_object(text)
  TO authenticated, service_role;

COMMIT;
