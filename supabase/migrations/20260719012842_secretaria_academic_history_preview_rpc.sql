BEGIN;

CREATE OR REPLACE FUNCTION public.get_secretaria_historico_academico(
  p_matricula_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payload jsonb;
  v_polo_id uuid;
BEGIN
  SELECT t.polo_id
    INTO v_polo_id
  FROM public.matriculas m
  JOIN public.turmas t ON t.id = m.turma_id
  WHERE m.id = p_matricula_id;

  IF v_polo_id IS NULL THEN
    RAISE EXCEPTION 'Matrícula acadêmica não localizada.'
      USING ERRCODE = 'P0002';
  END IF;

  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND (
      (SELECT auth.uid()) IS NULL
      OR NOT public.gestor_has_tab('secretaria', 'historico')
      OR NOT public.is_gestor_for_polo(v_polo_id)
    ) THEN
    RAISE EXCEPTION 'Acesso ao histórico acadêmico não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  WITH matricula_base AS (
    SELECT
      m.id,
      m.aluno_id,
      m.turma_id,
      m.status,
      m.data_matricula,
      t.data_inicio,
      t.data_previsao_termino,
      c.carga_horaria AS carga_horaria_curso,
      t.frequencia_minima_percent,
      t.media_minima
    FROM public.matriculas m
    JOIN public.turmas t ON t.id = m.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE m.id = p_matricula_id
  ),
  aulas AS (
    SELECT
      a.disciplina_id,
      count(*) AS total,
      sum(CASE WHEN a.carga_horaria > 0 THEN a.carga_horaria ELSE 1 END) AS horas
    FROM public.aulas_turma a
    JOIN matricula_base mb ON mb.turma_id = a.turma_id
    GROUP BY a.disciplina_id
  ),
  frequencias AS (
    SELECT
      f.disciplina_id,
      count(*) FILTER (WHERE f.status = 'F') AS faltas,
      count(*) AS lancamentos,
      sum(
        CASE WHEN f.status = 'F'
          THEN CASE WHEN a.carga_horaria > 0 THEN a.carga_horaria ELSE 1 END
          ELSE 0
        END
      ) AS horas_falta
    FROM public.diario_frequencia f
    JOIN public.aulas_turma a ON a.id = f.aula_id
    JOIN matricula_base mb
      ON mb.turma_id = f.turma_id
     AND mb.aluno_id = f.aluno_id
    GROUP BY f.disciplina_id
  ),
  componentes_base AS (
    SELECT
      mo.nome AS modulo_nome,
      mo.created_at AS modulo_ordem,
      d.nome AS disciplina_nome,
      coalesce(d.carga_horaria, 0) AS carga_horaria,
      n.nota_rec,
      ap.id AS aproveitamento_id,
      mb.frequencia_minima_percent,
      mb.media_minima,
      CASE
        WHEN ap.id IS NOT NULL THEN ap.frequencia_percent
        WHEN coalesce(a.horas, 0) > 0 AND coalesce(f.lancamentos, 0) = a.total
          THEN round(((a.horas - coalesce(f.horas_falta, 0)) / a.horas) * 100, 2)
        ELSE NULL
      END AS frequencia,
      CASE
        WHEN ap.id IS NOT NULL THEN ap.media_final
        WHEN n.aluno_id IS NULL THEN NULL
        ELSE least(
          10.00,
          round(((n.nota_p + n.nota_ti + n.nota_tg + n.nota_s) / 4.0
            + n.nota_cq + n.nota_o)::numeric, 1)
        )
      END AS parcial
    FROM matricula_base mb
    JOIN public.turmas_disciplinas td ON td.turma_id = mb.turma_id
    JOIN public.disciplinas d ON d.id = td.disciplina_id
    LEFT JOIN public.modulos mo ON mo.id = d.modulo_id
    LEFT JOIN aulas a ON a.disciplina_id = td.disciplina_id
    LEFT JOIN frequencias f ON f.disciplina_id = td.disciplina_id
    LEFT JOIN public.diario_notas n
      ON n.turma_id = mb.turma_id
     AND n.disciplina_id = td.disciplina_id
     AND n.aluno_id = mb.aluno_id
    LEFT JOIN public.matricula_aproveitamentos ap
      ON ap.matricula_id = mb.id
     AND ap.disciplina_id = td.disciplina_id
  ),
  componentes_finais AS (
    SELECT
      cb.*,
      CASE
        WHEN cb.parcial IS NULL THEN NULL
        WHEN cb.nota_rec IS NOT NULL AND cb.nota_rec > cb.parcial THEN cb.nota_rec
        ELSE cb.parcial
      END AS nota
    FROM componentes_base cb
  ),
  componentes AS (
    SELECT
      cf.*,
      CASE
        WHEN cf.aproveitamento_id IS NOT NULL THEN 'APROVEITADO'
        WHEN cf.parcial IS NULL THEN 'SEM_LANCAMENTO'
        WHEN cf.frequencia IS NULL THEN 'FREQUENCIA_PENDENTE'
        WHEN cf.frequencia < cf.frequencia_minima_percent THEN 'REPROVADO_FREQUENCIA'
        WHEN cf.nota >= cf.media_minima THEN 'APROVADO'
        WHEN cf.nota_rec IS NULL THEN 'EM_RECUPERACAO'
        ELSE 'REPROVADO'
      END AS resultado_final,
      CASE
        WHEN cf.aproveitamento_id IS NOT NULL THEN 'Aproveitado'
        WHEN cf.parcial IS NULL THEN 'Sem lançamento'
        WHEN cf.frequencia IS NULL THEN 'Frequência pendente'
        WHEN cf.frequencia < cf.frequencia_minima_percent THEN 'Reprovado por frequência'
        WHEN cf.nota >= cf.media_minima THEN 'Aprovado'
        WHEN cf.nota_rec IS NULL THEN 'Recuperação'
        ELSE 'Reprovado'
      END AS situacao
    FROM componentes_finais cf
  ),
  resumo AS (
    SELECT
      coalesce(sum(c.carga_horaria), 0)::integer AS carga_componentes,
      coalesce(sum(c.carga_horaria) FILTER (
        WHERE c.resultado_final IN ('APROVADO', 'APROVEITADO')
      ), 0)::integer AS carga_cumprida,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'moduleName', coalesce(c.modulo_nome, 'Módulo'),
            'moduleOrder', coalesce(extract(epoch FROM c.modulo_ordem) * 1000, 0),
            'discipline', c.disciplina_nome,
            'cargaHoraria', c.carga_horaria,
            'nota', c.nota,
            'frequencia', c.frequencia,
            'situacao', c.situacao
          )
          ORDER BY c.modulo_ordem NULLS FIRST, c.disciplina_nome
        ),
        '[]'::jsonb
      ) AS componentes
    FROM componentes c
  )
  SELECT jsonb_build_object(
    'componentes', r.componentes,
    'cargaHorariaCumprida', r.carga_cumprida,
    'cargaHorariaTotal', CASE
      WHEN coalesce(mb.carga_horaria_curso, 0) > 0 THEN mb.carga_horaria_curso
      ELSE r.carga_componentes
    END,
    'inicioCurso', coalesce(mb.data_matricula, mb.data_inicio),
    'fimCurso', mb.data_previsao_termino,
    'situacaoAcademica', CASE
      WHEN upper(coalesce(mb.status, '')) LIKE '%CONCLU%' THEN 'Concluído(a)'
      WHEN upper(coalesce(mb.status, '')) LIKE '%TRANC%' THEN 'Trancado(a)'
      WHEN upper(coalesce(mb.status, '')) LIKE '%SUSP%' THEN 'Suspenso(a)'
      WHEN upper(coalesce(mb.status, '')) LIKE '%INATIV%' THEN 'Inativo(a)'
      WHEN upper(coalesce(mb.status, '')) LIKE '%ATIV%' THEN 'Ativo(a)'
      WHEN upper(coalesce(mb.status, '')) LIKE '%EXCL%'
        OR upper(coalesce(mb.status, '')) LIKE '%CANCEL%' THEN 'Cancelado(a)'
      ELSE coalesce(nullif(mb.status, ''), 'Em análise')
    END
  )
    INTO v_payload
  FROM matricula_base mb
  CROSS JOIN resumo r;

  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.get_secretaria_historico_academico(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_secretaria_historico_academico(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_secretaria_historico_academico(uuid)
  IS 'Preview acadêmico autoritativo da Secretaria, restrito ao módulo e polo do gestor autenticado.';

COMMIT;
