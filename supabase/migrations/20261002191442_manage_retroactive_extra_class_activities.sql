-- Prazos históricos são válidos na implantação de turmas já iniciadas.
-- Preserva RLS, escopo operacional, autoria, respostas e limites de carga.
ALTER TABLE public.atividades_extra_classe
  ADD COLUMN IF NOT EXISTS status_antes_arquivo TEXT
  CHECK (status_antes_arquivo IN ('RASCUNHO', 'PUBLICADA'));

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
    NEW.status_antes_arquivo := NULL;
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
    -- O estado de origem é registrado pelo banco, nunca aceito do cliente.
    IF NEW.status = 'ARQUIVADA' AND OLD.status <> 'ARQUIVADA' THEN
      NEW.status_antes_arquivo := OLD.status;
    ELSIF OLD.status = 'ARQUIVADA' AND NEW.status <> 'ARQUIVADA' THEN
      IF OLD.status_antes_arquivo IS NULL OR NEW.status <> OLD.status_antes_arquivo THEN
        RAISE EXCEPTION 'A restauração deve preservar o estado original da atividade.'
          USING ERRCODE = '23514';
      END IF;
      NEW.status_antes_arquivo := NULL;
    ELSE
      NEW.status_antes_arquivo := OLD.status_antes_arquivo;
    END IF;

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


REVOKE EXECUTE ON FUNCTION public.stamp_and_validate_atividade_extra()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gerenciar_atividade_extra_classe(
  p_atividade_id UUID,
  p_acao TEXT,
  p_titulo TEXT DEFAULT NULL,
  p_prazo_entrega DATE DEFAULT NULL,
  p_carga_horaria NUMERIC DEFAULT NULL,
  p_updated_at_esperado TIMESTAMPTZ DEFAULT NULL
)
RETURNS public.atividades_extra_classe
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_atividade public.atividades_extra_classe%ROWTYPE;
  v_acao TEXT := upper(btrim(coalesce(p_acao, '')));
  v_estado TEXT;
  v_pode_operar BOOLEAN;
  v_pode_preparar BOOLEAN;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária.' USING ERRCODE = '42501';
  END IF;
  IF v_acao NOT IN ('EDITAR', 'ARQUIVAR', 'RESTAURAR') THEN
    RAISE EXCEPTION 'Ação de atividade inválida.' USING ERRCODE = '22023';
  END IF;

  -- O trigger de respostas já obtém FOR SHARE na mesma atividade:
  -- edição e entrega ficam serializadas sem alterar as respostas.
  SELECT ae.* INTO v_atividade
  FROM public.atividades_extra_classe ae
  WHERE ae.id = p_atividade_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atividade indisponível ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  v_pode_operar := coalesce(
    public.can_operate_atividade_extra(v_atividade.turma_id, v_atividade.disciplina_id), false);
  v_pode_preparar := coalesce(
    public.can_prepare_atividade_extra(v_atividade.turma_id, v_atividade.disciplina_id), false);
  v_estado := CASE WHEN v_atividade.status = 'ARQUIVADA'
    THEN v_atividade.status_antes_arquivo
    ELSE v_atividade.status END;

  IF NOT coalesce(v_pode_operar OR (v_estado = 'RASCUNHO' AND v_pode_preparar), false) THEN
    RAISE EXCEPTION 'Atividade indisponível ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  IF p_updated_at_esperado IS NOT NULL
    AND v_atividade.updated_at IS DISTINCT FROM p_updated_at_esperado THEN
    RAISE EXCEPTION 'A atividade foi alterada. Atualize a grade antes de tentar novamente.'
      USING ERRCODE = '40001';
  END IF;

  IF v_acao = 'EDITAR' THEN
    IF v_atividade.status = 'ARQUIVADA' THEN
      RAISE EXCEPTION 'Restaure a atividade antes de editar.' USING ERRCODE = '23514';
    END IF;
    IF nullif(btrim(p_titulo), '') IS NULL OR length(btrim(p_titulo)) > 1000 THEN
      RAISE EXCEPTION 'Informe um título de até 1000 caracteres.' USING ERRCODE = '23514';
    END IF;
    IF p_carga_horaria IS NULL OR p_carga_horaria <= 0
      OR p_carga_horaria::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Informe uma carga horária maior que zero.' USING ERRCODE = '23514';
    END IF;

    UPDATE public.atividades_extra_classe
    SET titulo = btrim(p_titulo),
      -- Temas independentes não são sobrescritos pelo editor resumido da grade.
      tema = CASE WHEN tema = v_atividade.titulo THEN btrim(p_titulo) ELSE tema END,
      prazo_entrega = p_prazo_entrega,
      carga_horaria_compensacao = p_carga_horaria
    WHERE id = p_atividade_id
    RETURNING * INTO v_atividade;
  ELSIF v_acao = 'ARQUIVAR' THEN
    IF v_atividade.status = 'ARQUIVADA' THEN
      RETURN v_atividade;
    END IF;
    UPDATE public.atividades_extra_classe
    SET status = 'ARQUIVADA'
    WHERE id = p_atividade_id
    RETURNING * INTO v_atividade;
  ELSE
    IF v_atividade.status <> 'ARQUIVADA' THEN
      RAISE EXCEPTION 'A atividade não está arquivada.' USING ERRCODE = '23514';
    END IF;
    IF v_estado IS NULL THEN
      RAISE EXCEPTION 'O estado original desta atividade antiga não foi registrado. Restauração indisponível.'
        USING ERRCODE = '23514';
    END IF;
    UPDATE public.atividades_extra_classe
    SET status = v_estado
    WHERE id = p_atividade_id
    RETURNING * INTO v_atividade;
  END IF;
  RETURN v_atividade;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.gerenciar_atividade_extra_classe(UUID, TEXT, TEXT, DATE, NUMERIC, TIMESTAMPTZ)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gerenciar_atividade_extra_classe(UUID, TEXT, TEXT, DATE, NUMERIC, TIMESTAMPTZ)
  TO authenticated;
