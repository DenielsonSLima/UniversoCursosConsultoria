BEGIN;

CREATE OR REPLACE FUNCTION public.get_aluno_matriculas_tecnicas_pendentes_secure()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_aluno_id uuid;
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória.'
      USING ERRCODE = '42501';
  END IF;

  v_aluno_id := public.current_aluno_id();

  IF v_aluno_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', matricula.id,
        'aluno_id', matricula.aluno_id,
        'turma_id', matricula.turma_id,
        'status', matricula.status,
        'data_matricula', matricula.data_matricula,
        'fluxo_operacional', matricula.fluxo_operacional,
        'turmas', jsonb_build_object(
          'id', turma.id,
          'curso_id', turma.curso_id,
          'nome', turma.nome,
          'codigo', turma.codigo,
          'status', turma.status,
          'turno', turma.turno,
          'data_inicio', turma.data_inicio,
          'data_previsao_termino', turma.data_previsao_termino,
          'polo_id', turma.polo_id,
          'cursos', jsonb_build_object(
            'id', curso.id,
            'nome', curso.nome,
            'modalidade', curso.modalidade,
            'carga_horaria', curso.carga_horaria,
            'imagem_url', curso.imagem_url,
            'area', curso.area
          )
        )
      )
      ORDER BY matricula.data_matricula DESC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM public.matriculas matricula
  JOIN public.turmas turma ON turma.id = matricula.turma_id
  JOIN public.cursos curso ON curso.id = turma.curso_id
  WHERE matricula.aluno_id = v_aluno_id
    AND upper(coalesce(matricula.status, '')) = 'PENDENTE'
    AND upper(coalesce(curso.modalidade, '')) IN ('TECNICO', 'TÉCNICO');

  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION
  public.get_aluno_matriculas_tecnicas_pendentes_secure()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.get_aluno_matriculas_tecnicas_pendentes_secure()
  TO authenticated, service_role;

COMMENT ON FUNCTION
  public.get_aluno_matriculas_tecnicas_pendentes_secure() IS
  'Retorna somente ao próprio aluno o resumo sanitizado de suas matrículas técnicas pendentes, sem liberar recursos acadêmicos protegidos.';

NOTIFY pgrst, 'reload schema';

COMMIT;
