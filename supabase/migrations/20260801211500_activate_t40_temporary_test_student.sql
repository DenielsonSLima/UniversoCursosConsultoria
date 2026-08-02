BEGIN;

DO $$
DECLARE
  v_matricula_id uuid := '12546a27-dd9b-47c2-bcdc-c0caef198b4b';
  v_aluno_id uuid := '430b1df8-84c9-4104-b859-40c81aa6655b';
  v_auth_user_id uuid := '40f144b5-2253-4cc9-9b8e-0c229acfe494';
  v_turma_id uuid := 'c735d106-cd41-474e-adb4-7e71ea5f3aca';
  v_match_count integer;
  v_charge_count integer;
BEGIN
  SELECT count(*)
  INTO v_match_count
  FROM public.matriculas matricula
  JOIN public.parceiros aluno ON aluno.id = matricula.aluno_id
  JOIN auth.users auth_user ON auth_user.id = aluno.auth_user_id
  JOIN public.turmas turma ON turma.id = matricula.turma_id
  JOIN public.cursos curso ON curso.id = turma.curso_id
  WHERE matricula.id = v_matricula_id
    AND matricula.aluno_id = v_aluno_id
    AND aluno.auth_user_id = v_auth_user_id
    AND matricula.turma_id = v_turma_id
    AND lower(auth_user.email) = 'aluno.tecnico@universo.com'
    AND aluno.nome = 'Aluno Técnico (teste temporário)'
    AND coalesce(
      (auth_user.raw_user_meta_data ->> 'test_account')::boolean,
      false
    )
    AND turma.codigo = 'ENF-T40-INT-MAT'
    AND turma.status = 'EM_ANDAMENTO'
    AND upper(curso.modalidade) = 'TECNICO'
    AND matricula.status = 'PENDENTE'
    AND matricula.financeiro_herdado = false
    AND matricula.gerar_cobranca_inicial = false
    AND coalesce(matricula.gerar_cobranca_futura, false) = false
    AND coalesce(matricula.sincronizar_asaas, false) = false;

  IF v_match_count <> 1 THEN
    RAISE EXCEPTION
      'Ativação de teste abortada: fixture divergente (% correspondências).',
      v_match_count;
  END IF;

  SELECT count(*)
  INTO v_charge_count
  FROM public.contas_receber
  WHERE matricula_id = v_matricula_id;

  IF v_charge_count <> 0 THEN
    RAISE EXCEPTION
      'Ativação de teste abortada: matrícula possui % cobrança(s).',
      v_charge_count;
  END IF;
END;
$$;

ALTER TABLE public.matriculas
  DISABLE TRIGGER criar_financeiro_ao_matricular_trigger;
ALTER TABLE public.matriculas
  DISABLE TRIGGER protect_technical_enrollment_lifecycle_trigger;
ALTER TABLE public.matriculas
  DISABLE TRIGGER trg_guard_technical_activation_document_versions;
ALTER TABLE public.matriculas
  DISABLE TRIGGER protect_matricula_control_fields_trigger;

UPDATE public.matriculas
SET
  status = 'ATIVO',
  financeiro_herdado = false,
  gerar_cobranca_inicial = false,
  gerar_cobranca_futura = false,
  sincronizar_asaas = false,
  fluxo_operacional = 'REGULAR',
  fluxo_operacional_motivo =
    'EXCEÇÃO TEMPORÁRIA DE TESTE: acesso acadêmico à Turma 40 sem financeiro; remover após homologação.',
  fluxo_operacional_definido_em = now(),
  fluxo_operacional_definido_por = NULL
WHERE id = '12546a27-dd9b-47c2-bcdc-c0caef198b4b'
  AND aluno_id = '430b1df8-84c9-4104-b859-40c81aa6655b'
  AND turma_id = 'c735d106-cd41-474e-adb4-7e71ea5f3aca'
  AND status = 'PENDENTE';

ALTER TABLE public.matriculas
  ENABLE TRIGGER protect_matricula_control_fields_trigger;
ALTER TABLE public.matriculas
  ENABLE TRIGGER trg_guard_technical_activation_document_versions;
ALTER TABLE public.matriculas
  ENABLE TRIGGER protect_technical_enrollment_lifecycle_trigger;
ALTER TABLE public.matriculas
  ENABLE TRIGGER criar_financeiro_ao_matricular_trigger;

DO $$
DECLARE
  v_status text;
  v_charge_count integer;
BEGIN
  SELECT status
  INTO v_status
  FROM public.matriculas
  WHERE id = '12546a27-dd9b-47c2-bcdc-c0caef198b4b'
    AND aluno_id = '430b1df8-84c9-4104-b859-40c81aa6655b'
    AND turma_id = 'c735d106-cd41-474e-adb4-7e71ea5f3aca';

  SELECT count(*)
  INTO v_charge_count
  FROM public.contas_receber
  WHERE matricula_id = '12546a27-dd9b-47c2-bcdc-c0caef198b4b';

  IF v_status <> 'ATIVO' OR v_charge_count <> 0 THEN
    RAISE EXCEPTION
      'Ativação de teste revertida: status %, cobranças %.',
      v_status,
      v_charge_count;
  END IF;
END;
$$;

COMMIT;
