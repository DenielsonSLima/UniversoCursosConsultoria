-- Canonical academic data shared by the scoped manager and own-student bulletin RPCs.
CREATE OR REPLACE FUNCTION internal_academic.get_document_payload(
  p_matricula_id uuid,
  p_documento text,
  p_modulo_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  IF p_documento NOT IN (
    'boletim',
    'atestado_conclusao_tecnico',
    'declaracao_frequencia',
    'historico_escolar',
    'transferencia'
  ) THEN
    RAISE EXCEPTION
      'Tipo de documento acadêmico não suportado.'
      USING ERRCODE = '22023';
  END IF;

  WITH matricula_base AS (
    SELECT
      matricula.id,
      public.formatar_matricula_validacao(
        matricula.id, matricula.data_matricula, turma.polo_id
      ) AS student_matricula,
      student.nome AS student_name,
      student.tipo_documento AS student_document_type,
      student.cpf_cnpj AS student_cpf,
      student.rg AS student_rg,
      matricula.status,
      matricula.data_matricula,
      turma.data_inicio,
      curso.carga_horaria AS carga_horaria_curso,
      curso.area AS curso_area,
      curso.eixo_tecnologico,
      curso.perfil_profissional_conclusao,
      (
        SELECT certificado.data_conclusao
        FROM public.certificados_academicos certificado
        WHERE certificado.matricula_id = matricula.id
          AND certificado.status = 'FINALIZADO'
        ORDER BY certificado.emitido_em DESC
        LIMIT 1
      ) AS data_conclusao
    FROM public.matriculas matricula
    JOIN public.turmas turma
      ON turma.id = matricula.turma_id
    JOIN public.cursos curso
      ON curso.id = turma.curso_id
    JOIN public.parceiros student
      ON student.id = matricula.aluno_id
    WHERE matricula.id = p_matricula_id
  ),
  resultados AS (
    SELECT resultado.*
    FROM internal_academic.get_enrollment_results(
      p_matricula_id
    ) resultado
  ),
  componentes AS (
    SELECT
      modulo.id AS modulo_id,
      modulo.nome AS modulo_nome,
      modulo.ordem AS modulo_ordem,
      modulo.created_at AS modulo_criado_em,
      disciplina.id AS disciplina_id,
      disciplina.nome AS disciplina_nome,
      disciplina.ordem AS disciplina_ordem,
      disciplina.created_at AS disciplina_criada_em,
      coalesce(disciplina.carga_horaria, 0) AS carga_horaria,
      coalesce(
        disciplina.carga_horaria_teoria,
        0
      ) AS carga_horaria_teoria,
      coalesce(
        disciplina.carga_horaria_pratica,
        0
      ) AS carga_horaria_pratica,
      coalesce(
        disciplina.carga_horaria_estagio,
        0
      ) AS carga_horaria_estagio,
      resultado.media_final AS nota,
      resultado.frequencia_percent AS frequencia,
      resultado.resultado_final,
      tentativa.id AS tentativa_dependencia_id,
      tentativa.numero_tentativa AS tentativa_dependencia_numero,
      tentativa.turma_id AS turma_dependencia_id,
      turma_dependencia.codigo AS turma_dependencia_codigo,
      CASE
        WHEN tentativa.id IS NOT NULL
          AND resultado.resultado_final = 'APROVADO'
          THEN 'Aprovado em dependência'
        ELSE CASE resultado.resultado_final
          WHEN 'APROVEITADO' THEN 'Aproveitado'
          WHEN 'SEM_LANCAMENTO' THEN 'Sem lançamento'
          WHEN 'FREQUENCIA_PENDENTE' THEN 'Frequência pendente'
          WHEN 'REPROVADO_FREQUENCIA'
            THEN 'Reprovado por frequência'
          WHEN 'APROVADO' THEN 'Aprovado'
          WHEN 'EM_RECUPERACAO' THEN 'Recuperação'
          WHEN 'REPROVADO' THEN 'Reprovado'
          ELSE 'Sem lançamento'
        END
      END AS situacao
    FROM matricula_base base
    JOIN public.matriculas matricula
      ON matricula.id = base.id
    JOIN public.turmas_disciplinas oferta
      ON oferta.turma_id = matricula.turma_id
    JOIN public.disciplinas disciplina
      ON disciplina.id = oferta.disciplina_id
    LEFT JOIN public.modulos modulo
      ON modulo.id = disciplina.modulo_id
    LEFT JOIN resultados resultado
      ON resultado.disciplina_id = oferta.disciplina_id
    LEFT JOIN public.matricula_componentes componente
      ON componente.matricula_id = matricula.id
     AND componente.disciplina_id = disciplina.id
     AND componente.status = 'APROVADO'
    LEFT JOIN public.matricula_disciplina_tentativas tentativa
      ON tentativa.id = componente.tentativa_aprovada_id
     AND tentativa.status = 'APROVADA'
    LEFT JOIN public.turmas turma_dependencia
      ON turma_dependencia.id = tentativa.turma_id
    WHERE p_modulo_id IS NULL OR (modulo.id = p_modulo_id AND EXISTS (
      SELECT 1 FROM public.periodos_letivos period
      WHERE period.id = oferta.periodo_letivo_id AND period.modulo_id = p_modulo_id
        AND period.turma_id = oferta.turma_id
        AND period.status IN ('ABERTO', 'EM_FECHAMENTO', 'FECHADO')
    ))
  ),
  resumo AS (
    SELECT
      coalesce(sum(componente.carga_horaria), 0)::integer
        AS carga_componentes,
      round(
        avg(componente.nota)
          FILTER (WHERE componente.nota IS NOT NULL),
        2
      ) AS media_geral,
      round(
        sum(
          componente.frequencia
          * greatest(componente.carga_horaria, 1)
        ) FILTER (
          WHERE componente.frequencia IS NOT NULL
        )
        / nullif(
          sum(
            greatest(componente.carga_horaria, 1)
          ) FILTER (
            WHERE componente.frequencia IS NOT NULL
          ),
          0
        ),
        2
      ) AS frequencia_geral,
      coalesce(
        sum(componente.carga_horaria) FILTER (
          WHERE componente.resultado_final IN (
            'APROVADO',
            'APROVEITADO'
          )
        ),
        0
      )::integer AS carga_cumprida,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'moduleId',
            componente.modulo_id,
            'moduleName',
            coalesce(componente.modulo_nome, 'Módulo'),
            'moduleOrder',
            coalesce(componente.modulo_ordem, 2147483647),
            'disciplineId',
            componente.disciplina_id,
            'disciplineOrder',
            coalesce(
              componente.disciplina_ordem,
              2147483647
            ),
            'discipline',
            componente.disciplina_nome,
            'cargaHoraria',
            componente.carga_horaria,
            'cargaHorariaTeoria',
            componente.carga_horaria_teoria,
            'cargaHorariaPratica',
            componente.carga_horaria_pratica,
            'cargaHorariaEstagio',
            componente.carga_horaria_estagio,
            'nota',
            componente.nota,
            'notaEstagio',
            NULL,
            'frequencia',
            componente.frequencia,
            'frequenciaEstagio',
            NULL,
            'situacao',
            componente.situacao,
            'dependencyAttemptId',
            componente.tentativa_dependencia_id,
            'dependencyAttemptNumber',
            componente.tentativa_dependencia_numero,
            'dependencyClassId',
            componente.turma_dependencia_id,
            'dependencyClassCode',
            componente.turma_dependencia_codigo
          )
          ORDER BY
            componente.modulo_ordem NULLS LAST,
            componente.modulo_criado_em NULLS LAST,
            componente.disciplina_ordem NULLS LAST,
            componente.disciplina_criada_em NULLS LAST,
            componente.disciplina_nome
        ),
        '[]'::jsonb
      ) AS componentes
    FROM componentes componente
  )
  SELECT jsonb_build_object(
    'studentName', base.student_name,
    'studentMatricula', base.student_matricula,
    'studentDocumentType', base.student_document_type,
    'studentCpf', base.student_cpf,
    'studentRg', base.student_rg,
    'componentes',
    resumo.componentes,
    'mediaGeral',
    resumo.media_geral,
    'frequenciaGeral',
    resumo.frequencia_geral,
    'cargaHorariaCumprida',
    resumo.carga_cumprida,
    'cargaHorariaTotal',
    CASE
      WHEN p_modulo_id IS NULL AND coalesce(base.carga_horaria_curso, 0) > 0
        THEN base.carga_horaria_curso
      ELSE resumo.carga_componentes
    END,
    'inicioCurso',
    coalesce(base.data_inicio, base.data_matricula),
    'fimCurso',
    base.data_conclusao,
    'courseArea',
    coalesce(base.curso_area, ''),
    'courseTechnologicalAxis',
    coalesce(base.eixo_tecnologico, ''),
    'courseProfessionalProfile',
    coalesce(base.perfil_profissional_conclusao, ''),
    'situacaoAcademica',
    CASE
      WHEN upper(coalesce(base.status, '')) = 'EM_DEPENDENCIA'
        THEN 'Em dependência'
      WHEN upper(coalesce(base.status, '')) LIKE '%CONCLU%'
        THEN 'Concluído(a)'
      WHEN upper(coalesce(base.status, '')) LIKE '%TRANC%'
        THEN 'Trancado(a)'
      WHEN upper(coalesce(base.status, '')) LIKE '%SUSP%'
        THEN 'Suspenso(a)'
      WHEN upper(coalesce(base.status, '')) LIKE '%INATIV%'
        THEN 'Inativo(a)'
      WHEN upper(coalesce(base.status, '')) LIKE '%ATIV%'
        THEN 'Ativo(a)'
      WHEN upper(coalesce(base.status, '')) LIKE '%EXCL%'
        OR upper(coalesce(base.status, '')) LIKE '%CANCEL%'
        THEN 'Cancelado(a)'
      ELSE coalesce(
        nullif(base.status, ''),
        'Em análise'
      )
    END
  )
  INTO v_payload
  FROM matricula_base base
  CROSS JOIN resumo;

  RETURN v_payload;
END;
$$;

-- The private core is callable only through an independently authorized RPC.
REVOKE ALL ON FUNCTION internal_academic.get_document_payload(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_secretaria_documento_academico(
  p_matricula_id uuid,
  p_documento text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_polo_id uuid;
BEGIN
  IF p_documento NOT IN ('boletim', 'atestado_conclusao_tecnico',
    'declaracao_frequencia', 'historico_escolar', 'transferencia') THEN
    RAISE EXCEPTION 'Tipo de documento acadêmico não suportado.' USING ERRCODE = '22023';
  END IF;
  SELECT turma.polo_id INTO v_polo_id
  FROM public.matriculas matricula
  JOIN public.turmas turma ON turma.id = matricula.turma_id
  WHERE matricula.id = p_matricula_id;
  IF v_polo_id IS NULL THEN
    RAISE EXCEPTION 'Matrícula acadêmica não localizada.' USING ERRCODE = 'P0002';
  END IF;
  IF coalesce(auth.role(), '') <> 'service_role'
    AND (auth.uid() IS NULL OR NOT public.can_manage_secretaria_document(p_documento, v_polo_id))
  THEN
    RAISE EXCEPTION 'Acesso ao documento acadêmico não autorizado.' USING ERRCODE = '42501';
  END IF;
  RETURN internal_academic.get_document_payload(p_matricula_id, p_documento, NULL);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_secretaria_documento_academico(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_secretaria_documento_academico(uuid, text)
  TO authenticated, service_role;
