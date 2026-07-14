-- Escrita segura de atividades após o ciclo acadêmico técnico.

CREATE OR REPLACE FUNCTION public.can_operate_atividade_extra(
  p_turma_id UUID,
  p_disciplina_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.turmas t
    JOIN public.cursos c ON c.id = t.curso_id
    JOIN public.turmas_disciplinas td
      ON td.turma_id = t.id AND td.disciplina_id = p_disciplina_id
    LEFT JOIN public.periodos_letivos pl ON pl.id = td.periodo_letivo_id
    WHERE t.id = p_turma_id
      AND (
        (
          c.modalidade <> 'TECNICO'
          AND (
            (SELECT public.can_write_turma(t.id))
            OR (SELECT public.is_professor_assigned_disciplina_open(t.id, p_disciplina_id))
          )
        )
        OR
        (
          c.modalidade = 'TECNICO'
          AND upper(coalesce(t.status, '')) = 'EM_ANDAMENTO'
          AND upper(coalesce(pl.status, '')) IN ('ABERTO', 'EM_FECHAMENTO')
          AND (
            (SELECT public.can_write_turma(t.id))
            OR td.professor_id = (SELECT public.current_professor_id())
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_prepare_atividade_extra(
  p_turma_id UUID,
  p_disciplina_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.turmas t
    JOIN public.modulos m ON m.curso_id = t.curso_id
    JOIN public.disciplinas d ON d.modulo_id = m.id
    WHERE t.id = p_turma_id
      AND d.id = p_disciplina_id
      AND upper(coalesce(t.status, '')) IN ('PLANEJADA', 'INSCRICOES_ABERTAS')
      AND (SELECT public.can_write_turma(t.id))
  );
$$;

CREATE OR REPLACE FUNCTION public.stamp_and_validate_atividade_extra()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_id UUID := (SELECT auth.uid());
  v_service_role BOOLEAN := coalesce(
    current_setting('request.jwt.claim.role', true), ''
  ) = 'service_role';
  v_is_gestor BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.turmas t
    JOIN public.modulos m ON m.curso_id = t.curso_id
    JOIN public.disciplinas d ON d.modulo_id = m.id
    WHERE t.id = NEW.turma_id AND d.id = NEW.disciplina_id
  ) THEN
    RAISE EXCEPTION 'A disciplina informada não pertence ao curso desta turma.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT v_service_role AND v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível identificar o autor da atividade.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status = 'PUBLICADA' THEN
    IF NEW.prazo_entrega IS NOT NULL
      AND NEW.prazo_entrega < (pg_catalog.timezone('America/Maceio', now()))::date THEN
      RAISE EXCEPTION 'O prazo de uma atividade publicada não pode estar vencido.'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.tipo_resposta IN ('PERGUNTAS', 'MISTO')
      AND jsonb_array_length(NEW.perguntas) = 0 THEN
      RAISE EXCEPTION 'Atividades com perguntas precisam ter ao menos uma pergunta.'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.tipo_resposta IN ('PERGUNTAS', 'MISTO') AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(NEW.perguntas) AS questions(item)
      WHERE nullif(btrim(CASE
        WHEN jsonb_typeof(questions.item) = 'string' THEN questions.item #>> '{}'
        ELSE questions.item ->> 'pergunta'
      END), '') IS NULL
    ) THEN
      RAISE EXCEPTION 'Todas as perguntas publicadas precisam ter texto.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_is_gestor := (SELECT public.can_write_turma(NEW.turma_id));
    NEW.criado_por_auth_id := v_auth_id;
    NEW.atualizado_por_auth_id := v_auth_id;
    NEW.created_at := now();
    NEW.updated_at := now();
    IF v_service_role OR v_is_gestor THEN
      NEW.criado_por_tipo := 'GESTOR';
      NEW.criado_por_id := NULL;
    ELSE
      NEW.criado_por_tipo := 'PROFESSOR';
      NEW.criado_por_id := (SELECT public.current_professor_id());
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.atividade_extra_classe_respostas r
      WHERE r.atividade_id = OLD.id
    ) AND (
      NEW.titulo IS DISTINCT FROM OLD.titulo
      OR NEW.tema IS DISTINCT FROM OLD.tema
      OR NEW.tipo_resposta IS DISTINCT FROM OLD.tipo_resposta
      OR NEW.texto IS DISTINCT FROM OLD.texto
      OR NEW.video_url IS DISTINCT FROM OLD.video_url
      OR NEW.perguntas IS DISTINCT FROM OLD.perguntas
      OR NEW.carga_horaria_compensacao IS DISTINCT FROM OLD.carga_horaria_compensacao
      OR NEW.prazo_entrega IS DISTINCT FROM OLD.prazo_entrega
    ) THEN
      RAISE EXCEPTION 'Atividade respondida não pode ter conteúdo, formato, prazo ou carga alterados.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.turma_id IS DISTINCT FROM OLD.turma_id
      OR NEW.disciplina_id IS DISTINCT FROM OLD.disciplina_id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
      OR NEW.criado_por_auth_id IS DISTINCT FROM OLD.criado_por_auth_id
      OR NEW.criado_por_tipo IS DISTINCT FROM OLD.criado_por_tipo
      OR NEW.criado_por_id IS DISTINCT FROM OLD.criado_por_id THEN
      RAISE EXCEPTION 'Turma, disciplina e autoria original da atividade são imutáveis.'
        USING ERRCODE = '42501';
    END IF;
    NEW.atualizado_por_auth_id := v_auth_id;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_and_validate_atividade_extra_trigger
  ON public.atividades_extra_classe;
CREATE TRIGGER stamp_and_validate_atividade_extra_trigger
  BEFORE INSERT OR UPDATE ON public.atividades_extra_classe
  FOR EACH ROW EXECUTE FUNCTION public.stamp_and_validate_atividade_extra();

CREATE OR REPLACE FUNCTION public.prevent_atividade_extra_delete_with_responses()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.atividade_extra_classe_respostas r
    WHERE r.atividade_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'A atividade possui respostas e deve ser arquivada.'
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_atividade_extra_delete_with_responses_trigger
  ON public.atividades_extra_classe;
CREATE TRIGGER prevent_atividade_extra_delete_with_responses_trigger
  BEFORE DELETE ON public.atividades_extra_classe
  FOR EACH ROW EXECUTE FUNCTION public.prevent_atividade_extra_delete_with_responses();

REVOKE EXECUTE ON FUNCTION public.can_operate_atividade_extra(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_prepare_atividade_extra(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.stamp_and_validate_atividade_extra()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_atividade_extra_delete_with_responses()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_operate_atividade_extra(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_prepare_atividade_extra(UUID, UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "portal_atividades_extra_insert" ON public.atividades_extra_classe;
CREATE POLICY "portal_atividades_extra_insert"
  ON public.atividades_extra_classe FOR INSERT TO authenticated
  WITH CHECK (
    (status = 'RASCUNHO'
      AND (SELECT public.can_prepare_atividade_extra(turma_id, disciplina_id)))
    OR
    (status = 'PUBLICADA'
      AND (SELECT public.can_operate_atividade_extra(turma_id, disciplina_id)))
  );

DROP POLICY IF EXISTS "portal_atividades_extra_update" ON public.atividades_extra_classe;
CREATE POLICY "portal_atividades_extra_update"
  ON public.atividades_extra_classe FOR UPDATE TO authenticated
  USING (
    (status = 'RASCUNHO'
      AND (SELECT public.can_prepare_atividade_extra(turma_id, disciplina_id)))
    OR (SELECT public.can_operate_atividade_extra(turma_id, disciplina_id))
  )
  WITH CHECK (
    (status = 'RASCUNHO'
      AND (SELECT public.can_prepare_atividade_extra(turma_id, disciplina_id)))
    OR
    (status IN ('RASCUNHO', 'PUBLICADA', 'ARQUIVADA')
      AND (SELECT public.can_operate_atividade_extra(turma_id, disciplina_id)))
  );

DROP POLICY IF EXISTS "portal_atividades_extra_delete" ON public.atividades_extra_classe;
CREATE POLICY "portal_atividades_extra_delete"
  ON public.atividades_extra_classe FOR DELETE TO authenticated
  USING (
    status = 'RASCUNHO'
    AND (
      (SELECT public.can_prepare_atividade_extra(turma_id, disciplina_id))
      OR (SELECT public.can_operate_atividade_extra(turma_id, disciplina_id))
    )
  );
