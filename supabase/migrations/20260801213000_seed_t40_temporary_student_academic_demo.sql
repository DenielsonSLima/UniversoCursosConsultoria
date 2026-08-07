BEGIN;

DO $$
DECLARE
  v_matricula_id uuid := '12546a27-dd9b-47c2-bcdc-c0caef198b4b';
  v_aluno_id uuid := '430b1df8-84c9-4104-b859-40c81aa6655b';
  v_auth_user_id uuid := '40f144b5-2253-4cc9-9b8e-0c229acfe494';
  v_turma_id uuid := 'c735d106-cd41-474e-adb4-7e71ea5f3aca';
  v_match_count integer;
  v_charge_count integer;
  v_lesson_count integer;
  v_discipline_count integer;
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
    AND matricula.status = 'ATIVO'
    AND matricula.financeiro_herdado = false
    AND matricula.gerar_cobranca_inicial = false
    AND coalesce(matricula.gerar_cobranca_futura, false) = false
    AND coalesce(matricula.sincronizar_asaas, false) = false
    AND matricula.fluxo_operacional_motivo LIKE 'EXCEÇÃO TEMPORÁRIA DE TESTE:%';

  IF v_match_count <> 1 THEN
    RAISE EXCEPTION
      'Carga acadêmica de demonstração abortada: fixture divergente (% correspondências).',
      v_match_count;
  END IF;

  SELECT count(*)
  INTO v_charge_count
  FROM public.contas_receber
  WHERE matricula_id = v_matricula_id;

  SELECT count(*), count(DISTINCT disciplina_id)
  INTO v_lesson_count, v_discipline_count
  FROM public.aulas_turma
  WHERE turma_id = v_turma_id;

  IF v_charge_count <> 0 THEN
    RAISE EXCEPTION
      'Carga acadêmica de demonstração abortada: matrícula possui % cobrança(s).',
      v_charge_count;
  END IF;

  IF v_lesson_count <> 71 OR v_discipline_count <> 8 THEN
    RAISE EXCEPTION
      'Carga acadêmica de demonstração abortada: esperado 71 sessões em 8 disciplinas, encontrado % em %.',
      v_lesson_count,
      v_discipline_count;
  END IF;
END;
$$;

-- Os gatilhos de fechamento, dependência e auditoria representam lançamentos
-- oficiais. Esta carga é deliberadamente isolada no único aluno temporário.
ALTER TABLE public.diario_frequencia DISABLE TRIGGER USER;
ALTER TABLE public.diario_notas DISABLE TRIGGER USER;

WITH aulas_ordenadas AS (
  SELECT
    aula.*,
    row_number() OVER (
      PARTITION BY aula.disciplina_id
      ORDER BY aula.data_aula NULLS LAST, aula.sessao, aula.id
    ) AS ordem
  FROM public.aulas_turma aula
  WHERE aula.turma_id = 'c735d106-cd41-474e-adb4-7e71ea5f3aca'
)
INSERT INTO public.diario_frequencia (
  turma_id,
  disciplina_id,
  aula_id,
  aluno_id,
  status
)
SELECT
  aula.turma_id,
  aula.disciplina_id,
  aula.id,
  '430b1df8-84c9-4104-b859-40c81aa6655b'::uuid,
  CASE
    WHEN aula.ordem % 10 = 0 THEN 'F'::char(1)
    WHEN aula.ordem % 7 = 0 THEN 'J'::char(1)
    ELSE 'P'::char(1)
  END
FROM aulas_ordenadas aula
ON CONFLICT (aula_id, aluno_id)
DO UPDATE SET
  turma_id = EXCLUDED.turma_id,
  disciplina_id = EXCLUDED.disciplina_id,
  status = EXCLUDED.status;

WITH disciplinas_com_aula AS (
  SELECT
    aula.disciplina_id,
    dense_rank() OVER (
      ORDER BY periodo.ordem NULLS LAST, disciplina.ordem NULLS LAST, disciplina.nome
    ) AS ordem
  FROM public.aulas_turma aula
  JOIN public.turmas_disciplinas oferta
    ON oferta.turma_id = aula.turma_id
   AND oferta.disciplina_id = aula.disciplina_id
  JOIN public.disciplinas disciplina
    ON disciplina.id = aula.disciplina_id
  LEFT JOIN public.periodos_letivos periodo
    ON periodo.id = oferta.periodo_letivo_id
  WHERE aula.turma_id = 'c735d106-cd41-474e-adb4-7e71ea5f3aca'
  GROUP BY
    aula.disciplina_id,
    periodo.ordem,
    disciplina.ordem,
    disciplina.nome
)
INSERT INTO public.diario_notas (
  turma_id,
  disciplina_id,
  aluno_id,
  nota_p,
  nota_ti,
  nota_tg,
  nota_s,
  nota_cq,
  nota_o,
  nota_rec
)
SELECT
  'c735d106-cd41-474e-adb4-7e71ea5f3aca'::uuid,
  disciplina.disciplina_id,
  '430b1df8-84c9-4104-b859-40c81aa6655b'::uuid,
  8.0 + ((disciplina.ordem % 3) * 0.3),
  7.6 + ((disciplina.ordem % 4) * 0.3),
  8.2 + ((disciplina.ordem % 2) * 0.4),
  7.8 + ((disciplina.ordem % 3) * 0.4),
  8.4 + ((disciplina.ordem % 2) * 0.3),
  8.0 + ((disciplina.ordem % 4) * 0.2),
  NULL
FROM disciplinas_com_aula disciplina
ON CONFLICT (turma_id, disciplina_id, aluno_id)
DO UPDATE SET
  nota_p = EXCLUDED.nota_p,
  nota_ti = EXCLUDED.nota_ti,
  nota_tg = EXCLUDED.nota_tg,
  nota_s = EXCLUDED.nota_s,
  nota_cq = EXCLUDED.nota_cq,
  nota_o = EXCLUDED.nota_o,
  nota_rec = EXCLUDED.nota_rec;

ALTER TABLE public.diario_notas ENABLE TRIGGER USER;
ALTER TABLE public.diario_frequencia ENABLE TRIGGER USER;

DO $$
DECLARE
  v_frequency_count integer;
  v_grade_count integer;
  v_charge_count integer;
BEGIN
  SELECT count(*)
  INTO v_frequency_count
  FROM public.diario_frequencia
  WHERE turma_id = 'c735d106-cd41-474e-adb4-7e71ea5f3aca'
    AND aluno_id = '430b1df8-84c9-4104-b859-40c81aa6655b';

  SELECT count(*)
  INTO v_grade_count
  FROM public.diario_notas
  WHERE turma_id = 'c735d106-cd41-474e-adb4-7e71ea5f3aca'
    AND aluno_id = '430b1df8-84c9-4104-b859-40c81aa6655b';

  SELECT count(*)
  INTO v_charge_count
  FROM public.contas_receber
  WHERE matricula_id = '12546a27-dd9b-47c2-bcdc-c0caef198b4b';

  IF v_frequency_count <> 71 OR v_grade_count <> 8 OR v_charge_count <> 0 THEN
    RAISE EXCEPTION
      'Carga acadêmica de demonstração revertida: frequências %, notas %, cobranças %.',
      v_frequency_count,
      v_grade_count,
      v_charge_count;
  END IF;
END;
$$;

COMMIT;
