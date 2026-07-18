BEGIN;

CREATE OR REPLACE FUNCTION public.is_partner_in_gestor_read_scope(p_polo_id uuid, p_polo_ids uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.gestor_has_any_module(
    ARRAY['inicio', 'parceiros', 'cadastros', 'gestao', 'secretaria', 'financeiro', 'caixa', 'relatorios']
  )
  AND (
    public.is_gestor_global()
    OR (
      public.is_gestor()
      AND (
        p_polo_id IS NULL
        OR p_polo_id = ANY(coalesce(public.gestor_allowed_polo_ids(), ARRAY[]::uuid[]))
        OR EXISTS (
          SELECT 1
          FROM unnest(coalesce(p_polo_ids, ARRAY[]::uuid[])) partner_polo(id)
          WHERE partner_polo.id = ANY(coalesce(public.gestor_allowed_polo_ids(), ARRAY[]::uuid[]))
        )
      )
    )
  );
$$;

DROP POLICY IF EXISTS portal_comunicacao_chats_access ON public.comunicacao_chats;
CREATE POLICY portal_comunicacao_chats_access ON public.comunicacao_chats
FOR ALL TO authenticated
USING (
  remetente_id = public.current_aluno_id()
  OR remetente_id = public.current_professor_id()
  OR public.gestor_has_tab('comunicacao', 'comunicacao-mensagem')
)
WITH CHECK (
  remetente_id = public.current_aluno_id()
  OR remetente_id = public.current_professor_id()
  OR public.gestor_has_tab('comunicacao', 'comunicacao-mensagem')
);

DROP POLICY IF EXISTS portal_comunicacao_mensagens_access ON public.comunicacao_mensagens;
CREATE POLICY portal_comunicacao_mensagens_access ON public.comunicacao_mensagens
FOR ALL TO authenticated
USING (
  public.gestor_has_tab('comunicacao', 'comunicacao-mensagem')
  OR EXISTS (
    SELECT 1 FROM public.comunicacao_chats c
    WHERE c.id = chat_id
      AND (c.remetente_id = public.current_aluno_id() OR c.remetente_id = public.current_professor_id())
  )
)
WITH CHECK (
  public.gestor_has_tab('comunicacao', 'comunicacao-mensagem')
  OR EXISTS (
    SELECT 1 FROM public.comunicacao_chats c
    WHERE c.id = chat_id
      AND (c.remetente_id = public.current_aluno_id() OR c.remetente_id = public.current_professor_id())
  )
);

COMMIT;
