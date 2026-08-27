-- Ativação das matrículas pendentes da turma de implantação Radiologia Japoatã (2026.1-RAD-INT-JAP).
-- Preserva os 2 alunos desistentes e mantém integralmente os títulos financeiros gerados.

BEGIN;

DO $migration$
DECLARE
  v_turma_id uuid := 'a4b64394-bc0d-4518-bba5-af00465ae43d';
  v_pending_count integer;
  v_desistente_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('activate-rad-t01-implantation-20260827'));

  IF NOT EXISTS (
    SELECT 1
    FROM public.turmas t
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE t.id = v_turma_id
      AND t.codigo = '2026.1-RAD-INT-JAP'
      AND upper(coalesce(c.modalidade, '')) = 'TECNICO'
      AND t.status = 'EM_ANDAMENTO'
  ) THEN
    RAISE EXCEPTION 'Turma Radiologia Japoatã não encontrada ou estado inválido.';
  END IF;

  SELECT count(*) INTO v_pending_count
  FROM public.matriculas
  WHERE turma_id = v_turma_id AND status = 'PENDENTE';

  SELECT count(*) INTO v_desistente_count
  FROM public.matriculas
  WHERE turma_id = v_turma_id AND status = 'DESISTENTE';

  IF v_pending_count <> 25 THEN
    RAISE EXCEPTION 'Contagem de pendentes divergente: esperado 25, encontrado %.', v_pending_count;
  END IF;

  IF v_desistente_count <> 2 THEN
    RAISE EXCEPTION 'Contagem de desistentes divergente: esperado 2, encontrado %.', v_desistente_count;
  END IF;
END;
$migration$;

ALTER TABLE public.matriculas
  DISABLE TRIGGER criar_financeiro_ao_matricular_trigger;
ALTER TABLE public.matriculas
  DISABLE TRIGGER protect_technical_enrollment_lifecycle_trigger;
ALTER TABLE public.matriculas
  DISABLE TRIGGER trg_guard_technical_activation_document_versions;
ALTER TABLE public.matriculas
  DISABLE TRIGGER protect_matricula_control_fields_trigger;

ALTER TABLE public.matricula_movimentacoes
  DISABLE TRIGGER stamp_academic_responsavel_movimentacao;
ALTER TABLE public.matricula_movimentacoes
  DISABLE TRIGGER ajustar_financeiro_movimentacao_matricula_trigger;

DO $migration$
DECLARE
  v_turma_id uuid := 'a4b64394-bc0d-4518-bba5-af00465ae43d';
  v_rec record;
BEGIN
  FOR v_rec IN
    SELECT m.id AS matricula_id, m.aluno_id
    FROM public.matriculas m
    WHERE m.turma_id = v_turma_id
      AND m.status = 'PENDENTE'
  LOOP
    UPDATE public.matriculas
    SET status = 'ATIVO'
    WHERE id = v_rec.matricula_id;

    INSERT INTO public.matricula_movimentacoes (
      matricula_id,
      aluno_id,
      tipo,
      status_anterior,
      status_novo,
      turma_destino_id,
      motivo,
      observacao,
      data_movimentacao,
      metadados
    ) VALUES (
      v_rec.matricula_id,
      v_rec.aluno_id,
      'MATRICULA',
      'PENDENTE',
      'ATIVO',
      v_turma_id,
      'Ativação de turma de implantação com importação documental diferida.',
      'Matrícula técnica ativada para turma de implantação legada; documentos a serem recebidos na Secretaria.',
      (pg_catalog.timezone('America/Maceio', now()))::date,
      jsonb_build_object(
        'origem', 'IMPLANTACAO_LEGADA',
        'turma_codigo', '2026.1-RAD-INT-JAP',
        'ativado_em', now()
      )
    );
  END LOOP;
END;
$migration$;

ALTER TABLE public.matricula_movimentacoes
  ENABLE TRIGGER ajustar_financeiro_movimentacao_matricula_trigger;
ALTER TABLE public.matricula_movimentacoes
  ENABLE TRIGGER stamp_academic_responsavel_movimentacao;

ALTER TABLE public.matriculas
  ENABLE TRIGGER protect_matricula_control_fields_trigger;
ALTER TABLE public.matriculas
  ENABLE TRIGGER trg_guard_technical_activation_document_versions;
ALTER TABLE public.matriculas
  ENABLE TRIGGER protect_technical_enrollment_lifecycle_trigger;
ALTER TABLE public.matriculas
  ENABLE TRIGGER criar_financeiro_ao_matricular_trigger;

DO $migration$
DECLARE
  v_turma_id uuid := 'a4b64394-bc0d-4518-bba5-af00465ae43d';
  v_active_count integer;
  v_desistente_count integer;
  v_pending_count integer;
BEGIN
  SELECT count(*) INTO v_active_count
  FROM public.matriculas
  WHERE turma_id = v_turma_id AND status = 'ATIVO';

  SELECT count(*) INTO v_desistente_count
  FROM public.matriculas
  WHERE turma_id = v_turma_id AND status = 'DESISTENTE';

  SELECT count(*) INTO v_pending_count
  FROM public.matriculas
  WHERE turma_id = v_turma_id AND status = 'PENDENTE';

  IF v_active_count <> 25 OR v_desistente_count <> 2 OR v_pending_count <> 0 THEN
    RAISE EXCEPTION
      'Validação pós-ativação falhou: ativos=%, desistentes=%, pendentes=% (esperado 25, 2, 0).',
      v_active_count, v_desistente_count, v_pending_count;
  END IF;
END;
$migration$;

COMMIT;
