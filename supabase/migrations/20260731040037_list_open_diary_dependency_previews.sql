-- Resultados reprovados de diário aberto são visíveis no workspace, mas não
-- representam dependências consolidadas e jamais podem iniciar cobrança.
CREATE OR REPLACE FUNCTION public.get_secretaria_dependencias_workspace_secure(
  p_polo_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_workspace jsonb;
  v_disciplines jsonb;
  v_open_dependencies jsonb;
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND (
      NOT (
        public.gestor_has_tab(
          'secretaria',
          'dependencias-academicas'
        )
        OR public.gestor_has_tab('secretaria', 'solicitacoes')
      )
      OR (
        p_polo_id IS NOT NULL
        AND NOT public.is_gestor_for_polo(p_polo_id)
      )
    )
  THEN
    RAISE EXCEPTION
      'Acesso ao workspace de dependências não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  -- O contrato anterior continua sendo a única fonte de dependências
  -- consolidadas e acionáveis.
  v_workspace :=
    public.p2_get_secretaria_dependencias_workspace_secure_20260730(
      p_polo_id,
      p_search
    );

  SELECT coalesce(
    jsonb_agg(
      row_data
      ORDER BY
        row_data ->> 'alunoNome',
        row_data ->> 'disciplinaNome'
    ),
    '[]'::jsonb
  )
  INTO v_open_dependencies
  FROM (
    SELECT jsonb_build_object(
      'id',
      matricula.id::text || ':' || disciplina.id::text || ':open',
      'matriculaId',
      matricula.id,
      'alunoId',
      aluno.id,
      'alunoNome',
      aluno.nome,
      'aluno_cpf',
      aluno.cpf_cnpj,
      'turmaOrigemId',
      turma_origem.id,
      'turmaOrigemCodigo',
      turma_origem.codigo,
      'turmaOrigemNome',
      turma_origem.nome,
      'cursoId',
      curso.id,
      'cursoNome',
      curso.nome,
      'poloId',
      turma_origem.polo_id,
      'disciplinaId',
      disciplina.id,
      'disciplinaNome',
      disciplina.nome,
      'cargaHoraria',
      disciplina.carga_horaria,
      'resultadoFinal',
      resultado.resultado_final,
      'resultadoOriginal',
      resultado.resultado_final,
      'frequenciaPercent',
      resultado.frequencia_percent,
      'frequenciaOriginal',
      resultado.frequencia_percent,
      'mediaParcial',
      resultado.media_parcial,
      'notaRec',
      resultado.nota_rec,
      'mediaFinal',
      resultado.media_final,
      'notaOriginal',
      resultado.media_final,
      'diarioBloqueio',
      oferta_origem.bloqueio_diario,
      'diarioFechadoEm',
      oferta_origem.diario_bloqueado_em,
      'diarioObservacao',
      'Diário em aberto — resultado provisório',
      'resultadoConsolidado',
      false,
      'acionavel',
      false,
      'tentativaNumero',
      1,
      'tentativaStatus',
      'DIARIO_EM_ABERTO',
      'status',
      'DIARIO_EM_ABERTO',
      'motivo_reprovacao',
      CASE resultado.resultado_final
        WHEN 'REPROVADO_FREQUENCIA'
          THEN 'Reprovação por frequência'
        ELSE 'Reprovação acadêmica'
      END
    ) AS row_data
    FROM public.matriculas matricula
    JOIN public.parceiros aluno
      ON aluno.id = matricula.aluno_id
    JOIN public.turmas turma_origem
      ON turma_origem.id = matricula.turma_id
    JOIN public.cursos curso
      ON curso.id = turma_origem.curso_id
    JOIN public.turmas_disciplinas oferta_origem
      ON oferta_origem.turma_id = turma_origem.id
    JOIN public.disciplinas disciplina
      ON disciplina.id = oferta_origem.disciplina_id
    CROSS JOIN LATERAL public.get_diario_resultados(
      turma_origem.id,
      disciplina.id
    ) resultado
    WHERE resultado.aluno_id = matricula.aluno_id
      AND upper(coalesce(curso.modalidade, ''))
        IN ('TECNICO', 'TÉCNICO')
      AND (
        oferta_origem.bloqueio_diario IS DISTINCT FROM 'TOTAL'
        OR oferta_origem.diario_bloqueado_em IS NULL
      )
      AND resultado.resultado_final IN (
        'REPROVADO_FREQUENCIA',
        'REPROVADO'
      )
      AND (
        p_polo_id IS NULL
        OR turma_origem.polo_id = p_polo_id
      )
      AND internal_academic.can_manage_dependency_workspace(
        turma_origem.id
      )
      AND (
        nullif(btrim(coalesce(p_search, '')), '') IS NULL
        OR lower(aluno.nome)
          LIKE '%' || lower(btrim(p_search)) || '%'
        OR lower(disciplina.nome)
          LIKE '%' || lower(btrim(p_search)) || '%'
        OR lower(turma_origem.codigo)
          LIKE '%' || lower(btrim(p_search)) || '%'
      )
  ) open_rows;

  v_workspace := jsonb_set(
    v_workspace,
    '{dependencias}',
    coalesce(v_workspace -> 'dependencias', '[]'::jsonb)
      || v_open_dependencies,
    true
  );

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', catalog.disciplina_id,
        'nome', catalog.disciplina_nome,
        'carga_horaria', catalog.carga_horaria,
        'cursoId', catalog.curso_id,
        'cursoNome', catalog.curso_nome
      )
      ORDER BY catalog.curso_nome, catalog.disciplina_nome
    ),
    '[]'::jsonb
  )
  INTO v_disciplines
  FROM (
    SELECT DISTINCT
      disciplina.id AS disciplina_id,
      disciplina.nome AS disciplina_nome,
      disciplina.carga_horaria,
      curso.id AS curso_id,
      curso.nome AS curso_nome
    FROM public.turmas turma
    JOIN public.cursos curso ON curso.id = turma.curso_id
    JOIN public.turmas_disciplinas oferta
      ON oferta.turma_id = turma.id
    JOIN public.disciplinas disciplina
      ON disciplina.id = oferta.disciplina_id
    WHERE p_polo_id IS NOT NULL
      AND turma.polo_id = p_polo_id
      AND upper(coalesce(curso.modalidade, ''))
        IN ('TECNICO', 'TÉCNICO')
      AND internal_academic.can_manage_dependency_workspace(turma.id)
  ) catalog;

  RETURN v_workspace || jsonb_build_object(
    'disciplinas_configuraveis',
    v_disciplines
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.get_secretaria_dependencias_workspace_secure(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.get_secretaria_dependencias_workspace_secure(uuid, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION
  public.get_secretaria_dependencias_workspace_secure(uuid, text)
IS
  'Workspace de dependências: resultados de diário aberto são prévias não acionáveis; somente diário TOTAL produz dependência consolidada.';

-- Faltas e notas alteram a prévia imediatamente. O outbox mantém o escopo por
-- polo e evita expor diretamente as tabelas do diário ao perfil da Secretaria.
DROP TRIGGER IF EXISTS
  diario_frequencia_emit_gestao_realtime_event
  ON public.diario_frequencia;
CREATE TRIGGER diario_frequencia_emit_gestao_realtime_event
AFTER INSERT OR UPDATE OR DELETE ON public.diario_frequencia
FOR EACH ROW
EXECUTE FUNCTION public.emit_turma_academic_gestao_realtime_event();

DROP TRIGGER IF EXISTS
  diario_notas_emit_gestao_realtime_event
  ON public.diario_notas;
CREATE TRIGGER diario_notas_emit_gestao_realtime_event
AFTER INSERT OR UPDATE OR DELETE ON public.diario_notas
FOR EACH ROW
EXECUTE FUNCTION public.emit_turma_academic_gestao_realtime_event();
