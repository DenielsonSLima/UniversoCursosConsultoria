BEGIN;

CREATE OR REPLACE FUNCTION public.guard_comunicacao_mensagem_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_aluno_id uuid := public.current_aluno_id();
  v_professor_id uuid := public.current_professor_id();
  v_gestor_id uuid;
  v_actor_name text;
  v_attachment_path text;
  v_public_prefix constant text :=
    'https://kfekgwyqozhicpfuunpo.supabase.co/storage/v1/object/public/anexos/';
  v_can_manage boolean := public.gestor_has_tab(
    'comunicacao',
    'comunicacao-mensagem'
  );
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN
    RETURN CASE WHEN tg_op = 'DELETE' THEN old ELSE new END;
  END IF;

  IF tg_op = 'UPDATE' THEN
    IF new.id IS DISTINCT FROM old.id
      OR new.chat_id IS DISTINCT FROM old.chat_id
      OR new.remetente_id IS DISTINCT FROM old.remetente_id
      OR new.remetente_nome IS DISTINCT FROM old.remetente_nome
      OR new.remetente_tipo IS DISTINCT FROM old.remetente_tipo
      OR new.conteudo IS DISTINCT FROM old.conteudo
      OR new.anexo_url IS DISTINCT FROM old.anexo_url
      OR new.anexo_path IS DISTINCT FROM old.anexo_path
      OR new.created_at IS DISTINCT FROM old.created_at
    THEN
      RAISE EXCEPTION 'Somente o status de leitura da mensagem pode ser alterado.'
        USING ERRCODE = '42501';
    END IF;
    RETURN new;
  END IF;

  IF tg_op = 'DELETE' THEN
    IF NOT v_can_manage THEN
      RAISE EXCEPTION 'Somente o gestor pode excluir mensagens.'
        USING ERRCODE = '42501';
    END IF;
    RETURN old;
  END IF;

  IF nullif(btrim(coalesce(new.conteudo, '')), '') IS NULL
    OR length(new.conteudo) > 10000
  THEN
    RAISE EXCEPTION 'A mensagem deve possuir entre 1 e 10000 caracteres.'
      USING ERRCODE = '23514';
  END IF;

  IF v_aluno_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.comunicacao_chats c
    WHERE c.id = new.chat_id
      AND c.remetente_id = v_aluno_id
  ) THEN
    SELECT p.nome INTO v_actor_name
    FROM public.parceiros p
    WHERE p.id = v_aluno_id;
    new.remetente_id := v_aluno_id;
    new.remetente_nome := coalesce(nullif(btrim(v_actor_name), ''), 'Aluno');
    new.remetente_tipo := 'aluno';
  ELSIF v_professor_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.comunicacao_chats c
    WHERE c.id = new.chat_id
      AND c.remetente_id = v_professor_id
  ) THEN
    SELECT p.nome INTO v_actor_name
    FROM public.parceiros p
    WHERE p.id = v_professor_id;
    new.remetente_id := v_professor_id;
    new.remetente_nome := coalesce(nullif(btrim(v_actor_name), ''), 'Professor');
    new.remetente_tipo := 'professor';
  ELSIF v_can_manage THEN
    IF lower(coalesce(new.remetente_tipo, '')) = 'sistema' THEN
      new.remetente_id := NULL;
      new.remetente_nome := 'Sistema';
      new.remetente_tipo := 'sistema';
    ELSE
      SELECT u.id, u.nome INTO v_gestor_id, v_actor_name
      FROM public.usuarios_sistema u
      WHERE lower(u.email) = public.auth_email()
        AND public.is_active_status(u.status)
      ORDER BY u.created_at DESC NULLS LAST
      LIMIT 1;

      IF v_gestor_id IS NULL THEN
        RAISE EXCEPTION 'Gestor autenticado não encontrado.'
          USING ERRCODE = '42501';
      END IF;

      new.remetente_id := v_gestor_id;
      new.remetente_nome := coalesce(nullif(btrim(v_actor_name), ''), 'Gestor');
      new.remetente_tipo := 'gestor';
    END IF;
  ELSE
    RAISE EXCEPTION 'Usuário sem permissão para enviar mensagem neste atendimento.'
      USING ERRCODE = '42501';
  END IF;

  IF new.anexo_path IS NOT NULL
    AND NOT public.can_upload_anexo_storage_object(new.anexo_path)
  THEN
    RAISE EXCEPTION 'Anexo fora do atendimento autorizado.'
      USING ERRCODE = '42501';
  END IF;

  IF new.anexo_url IS NOT NULL THEN
    IF left(new.anexo_url, length(v_public_prefix)) = v_public_prefix THEN
      v_attachment_path := substring(new.anexo_url FROM length(v_public_prefix) + 1);
    ELSIF new.anexo_url !~* '^https?://' THEN
      v_attachment_path := trim(leading '/' FROM new.anexo_url);
    ELSE
      RAISE EXCEPTION 'URL externa de anexo não permitida.'
        USING ERRCODE = '42501';
    END IF;

    IF nullif(v_attachment_path, '') IS NULL
      OR NOT public.can_upload_anexo_storage_object(v_attachment_path)
    THEN
      RAISE EXCEPTION 'Anexo fora do atendimento autorizado.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_comunicacao_mensagem_write()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_comunicacao_mensagem_write
  ON public.comunicacao_mensagens;
CREATE TRIGGER guard_comunicacao_mensagem_write
BEFORE INSERT OR UPDATE OR DELETE ON public.comunicacao_mensagens
FOR EACH ROW EXECUTE FUNCTION public.guard_comunicacao_mensagem_write();

DROP POLICY IF EXISTS portal_comunicacao_mensagens_access
  ON public.comunicacao_mensagens;
DROP POLICY IF EXISTS portal_comunicacao_mensagens_select
  ON public.comunicacao_mensagens;
DROP POLICY IF EXISTS portal_comunicacao_mensagens_insert
  ON public.comunicacao_mensagens;
DROP POLICY IF EXISTS portal_comunicacao_mensagens_update
  ON public.comunicacao_mensagens;
DROP POLICY IF EXISTS portal_comunicacao_mensagens_delete
  ON public.comunicacao_mensagens;

CREATE POLICY portal_comunicacao_mensagens_select
ON public.comunicacao_mensagens
FOR SELECT TO authenticated
USING (
  public.gestor_has_tab('comunicacao', 'comunicacao-mensagem')
  OR EXISTS (
    SELECT 1
    FROM public.comunicacao_chats c
    WHERE c.id = comunicacao_mensagens.chat_id
      AND c.remetente_id IN (
        public.current_aluno_id(),
        public.current_professor_id()
      )
  )
);

CREATE POLICY portal_comunicacao_mensagens_insert
ON public.comunicacao_mensagens
FOR INSERT TO authenticated
WITH CHECK (
  public.gestor_has_tab('comunicacao', 'comunicacao-mensagem')
  OR EXISTS (
    SELECT 1
    FROM public.comunicacao_chats c
    WHERE c.id = comunicacao_mensagens.chat_id
      AND c.remetente_id IN (
        public.current_aluno_id(),
        public.current_professor_id()
      )
  )
);

CREATE POLICY portal_comunicacao_mensagens_update
ON public.comunicacao_mensagens
FOR UPDATE TO authenticated
USING (
  public.gestor_has_tab('comunicacao', 'comunicacao-mensagem')
  OR EXISTS (
    SELECT 1
    FROM public.comunicacao_chats c
    WHERE c.id = comunicacao_mensagens.chat_id
      AND c.remetente_id IN (
        public.current_aluno_id(),
        public.current_professor_id()
      )
  )
)
WITH CHECK (
  public.gestor_has_tab('comunicacao', 'comunicacao-mensagem')
  OR EXISTS (
    SELECT 1
    FROM public.comunicacao_chats c
    WHERE c.id = comunicacao_mensagens.chat_id
      AND c.remetente_id IN (
        public.current_aluno_id(),
        public.current_professor_id()
      )
  )
);

CREATE POLICY portal_comunicacao_mensagens_delete
ON public.comunicacao_mensagens
FOR DELETE TO authenticated
USING (public.gestor_has_tab('comunicacao', 'comunicacao-mensagem'));

COMMIT;
