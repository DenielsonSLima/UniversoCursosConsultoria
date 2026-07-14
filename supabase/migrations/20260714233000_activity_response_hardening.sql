-- Entregas e correções: conteúdo obrigatório, prazo e auditoria não forjável.

CREATE OR REPLACE FUNCTION public.can_submit_atividade_extra(p_atividade_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.atividades_extra_classe ae
    JOIN public.turmas t ON t.id = ae.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
    JOIN public.turmas_disciplinas td ON td.turma_id = ae.turma_id
      AND td.disciplina_id = ae.disciplina_id
    LEFT JOIN public.periodos_letivos pl ON pl.id = td.periodo_letivo_id
    JOIN public.matriculas m ON m.turma_id = t.id
    WHERE ae.id = p_atividade_id
      AND ae.status = 'PUBLICADA'
      AND upper(coalesce(m.status, '')) = 'ATIVO'
      AND m.aluno_id = (SELECT public.current_aluno_id())
      AND (
        ae.prazo_entrega IS NULL
        OR ae.prazo_entrega >= (pg_catalog.timezone('America/Maceio', now()))::date
      )
      AND (
        c.modalidade <> 'TECNICO'
        OR (upper(coalesce(t.status, '')) = 'EM_ANDAMENTO'
          AND upper(coalesce(pl.status, '')) = 'ABERTO')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.validate_and_audit_atividade_resposta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_atividade public.atividades_extra_classe%rowtype;
  v_auth_id UUID := (SELECT auth.uid());
  v_aluno_id UUID := (SELECT public.current_aluno_id());
  v_is_staff BOOLEAN := false;
  v_normalized_answers JSONB := '[]'::jsonb;
  v_missing_answer BOOLEAN := false;
BEGIN
  SELECT * INTO v_atividade
  FROM public.atividades_extra_classe
  WHERE id = NEW.atividade_id
  FOR SHARE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Atividade não encontrada.'; END IF;
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível identificar o autor da operação.'
      USING ERRCODE = '42501';
  END IF;

  v_is_staff := (SELECT public.can_operate_atividade_extra(
    v_atividade.turma_id,
    v_atividade.disciplina_id
  ));

  IF TG_OP = 'UPDATE' AND v_is_staff THEN
    IF NEW.atividade_id IS DISTINCT FROM OLD.atividade_id
      OR NEW.aluno_id IS DISTINCT FROM OLD.aluno_id
      OR NEW.resposta_texto IS DISTINCT FROM OLD.resposta_texto
      OR NEW.respostas IS DISTINCT FROM OLD.respostas
      OR NEW.anexo_url IS DISTINCT FROM OLD.anexo_url
      OR NEW.entregue_em IS DISTINCT FROM OLD.entregue_em
      OR NEW.entregue_por_auth_id IS DISTINCT FROM OLD.entregue_por_auth_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'A correção não pode alterar a entrega original.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status <> 'CORRIGIDA' THEN
      RAISE EXCEPTION 'Uma correção acadêmica não pode ser revertida para entregue.'
        USING ERRCODE = '42501';
    END IF;
    NEW.corrigido_em := now();
    NEW.corrigido_por_auth_id := v_auth_id;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF v_aluno_id IS NULL OR NEW.aluno_id IS DISTINCT FROM v_aluno_id THEN
    RAISE EXCEPTION 'A entrega deve pertencer ao aluno autenticado.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.atividade_id IS DISTINCT FROM OLD.atividade_id
      OR NEW.aluno_id IS DISTINCT FROM OLD.aluno_id
      OR NEW.nota IS DISTINCT FROM OLD.nota
      OR NEW.feedback IS DISTINCT FROM OLD.feedback
      OR NEW.corrigido_em IS DISTINCT FROM OLD.corrigido_em
      OR NEW.corrigido_por_auth_id IS DISTINCT FROM OLD.corrigido_por_auth_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Nota, feedback, correção e autoria não podem ser alterados pelo aluno.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    NEW.created_at := now();
    NEW.nota := NULL;
    NEW.feedback := NULL;
    NEW.corrigido_em := NULL;
    NEW.corrigido_por_auth_id := NULL;
  END IF;

  IF v_atividade.tipo_resposta IN ('PERGUNTAS', 'MISTO') THEN
    IF jsonb_array_length(v_atividade.perguntas) = 0 THEN
      RAISE EXCEPTION 'A atividade não possui perguntas válidas.'
        USING ERRCODE = '23514';
    END IF;

    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'pergunta', CASE
            WHEN jsonb_typeof(question.item) = 'string' THEN question.item #>> '{}'
            ELSE coalesce(question.item ->> 'pergunta', 'Pergunta ' || question.ord)
          END,
          'resposta', coalesce(answer.item ->> 'resposta', '')
        ) ORDER BY question.ord
      ),
      '[]'::jsonb
    )
    INTO v_normalized_answers
    FROM jsonb_array_elements(v_atividade.perguntas)
      WITH ORDINALITY AS question(item, ord)
    LEFT JOIN jsonb_array_elements(coalesce(NEW.respostas, '[]'::jsonb))
      WITH ORDINALITY AS answer(item, ord)
      ON answer.ord = question.ord;

    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_normalized_answers) item
      WHERE nullif(btrim(item ->> 'resposta'), '') IS NULL
    ) INTO v_missing_answer;

    IF v_missing_answer THEN
      RAISE EXCEPTION 'Todas as perguntas obrigatórias devem ser respondidas.'
        USING ERRCODE = '23514';
    END IF;
    NEW.respostas := v_normalized_answers;
  ELSE
    NEW.respostas := '[]'::jsonb;
  END IF;

  IF v_atividade.tipo_resposta NOT IN ('TEXTO', 'MISTO') THEN
    NEW.resposta_texto := NULL;
  END IF;
  IF v_atividade.tipo_resposta NOT IN ('ENVIO', 'MISTO') THEN
    NEW.anexo_url := NULL;
  END IF;

  IF v_atividade.tipo_resposta = 'TEXTO'
    AND nullif(btrim(NEW.resposta_texto), '') IS NULL THEN
    RAISE EXCEPTION 'Preencha a resposta em texto.' USING ERRCODE = '23514';
  END IF;
  IF v_atividade.tipo_resposta = 'ENVIO' AND NEW.anexo_url IS NULL THEN
    RAISE EXCEPTION 'Informe o link HTTPS do trabalho.' USING ERRCODE = '23514';
  END IF;
  IF v_atividade.tipo_resposta = 'MISTO'
    AND nullif(btrim(NEW.resposta_texto), '') IS NULL
    AND NEW.anexo_url IS NULL THEN
    RAISE EXCEPTION 'Informe a resposta em texto ou o link HTTPS do trabalho.'
      USING ERRCODE = '23514';
  END IF;

  NEW.status := 'ENTREGUE';
  NEW.entregue_em := now();
  NEW.entregue_por_auth_id := v_auth_id;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_and_audit_atividade_resposta_trigger
  ON public.atividade_extra_classe_respostas;
CREATE TRIGGER validate_and_audit_atividade_resposta_trigger
  BEFORE INSERT OR UPDATE ON public.atividade_extra_classe_respostas
  FOR EACH ROW EXECUTE FUNCTION public.validate_and_audit_atividade_resposta();

REVOKE EXECUTE ON FUNCTION public.can_submit_atividade_extra(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.validate_and_audit_atividade_resposta()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_submit_atividade_extra(UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "portal_atividade_extra_respostas_insert"
  ON public.atividade_extra_classe_respostas;
CREATE POLICY "portal_atividade_extra_respostas_insert"
  ON public.atividade_extra_classe_respostas FOR INSERT TO authenticated
  WITH CHECK (
    aluno_id = (SELECT public.current_aluno_id())
    AND status = 'ENTREGUE'
    AND nota IS NULL AND feedback IS NULL
    AND (SELECT public.can_submit_atividade_extra(atividade_id))
  );

DROP POLICY IF EXISTS "portal_atividade_extra_respostas_update"
  ON public.atividade_extra_classe_respostas;
CREATE POLICY "portal_atividade_extra_respostas_update"
  ON public.atividade_extra_classe_respostas FOR UPDATE TO authenticated
  USING (
    (
      aluno_id = (SELECT public.current_aluno_id())
      AND status <> 'CORRIGIDA'
      AND (SELECT public.can_submit_atividade_extra(atividade_id))
    )
    OR EXISTS (
      SELECT 1 FROM public.atividades_extra_classe ae
      WHERE ae.id = atividade_id
        AND (SELECT public.can_operate_atividade_extra(ae.turma_id, ae.disciplina_id))
    )
  )
  WITH CHECK (
    (
      aluno_id = (SELECT public.current_aluno_id())
      AND status = 'ENTREGUE'
      AND nota IS NULL AND feedback IS NULL
      AND (SELECT public.can_submit_atividade_extra(atividade_id))
    )
    OR (
      status = 'CORRIGIDA'
      AND EXISTS (
        SELECT 1 FROM public.atividades_extra_classe ae
        WHERE ae.id = atividade_id
          AND (SELECT public.can_operate_atividade_extra(ae.turma_id, ae.disciplina_id))
      )
    )
  );

DROP POLICY IF EXISTS "portal_atividade_extra_respostas_delete"
  ON public.atividade_extra_classe_respostas;
