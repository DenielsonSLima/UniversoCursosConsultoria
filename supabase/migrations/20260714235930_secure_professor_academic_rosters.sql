-- Restringe o cadastro acadêmico completo ao gestor e expõe ao professor
-- apenas os dados mínimos necessários para diário e estágio.

-- A produção já possui as duas colunas operacionais finais. O DROP torna a
-- migration reproduzível também em bases remontadas pelas migrations antigas,
-- nas quais essa função ainda tinha somente oito colunas de retorno.
DROP FUNCTION IF EXISTS public.get_turma_alunos_academico(uuid);

CREATE OR REPLACE FUNCTION public.get_turma_alunos_academico(
  p_turma_id uuid
)
RETURNS TABLE (
  matricula_id uuid,
  aluno_id uuid,
  nome text,
  cpf text,
  data_nascimento date,
  data_matricula timestamptz,
  status text,
  frequencia_percent numeric,
  tem_lancamentos_academicos boolean,
  pode_remover boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.turmas t
    WHERE t.id = p_turma_id
      AND (
        coalesce((SELECT auth.role()), '') = 'service_role'
        OR (
          t.polo_id IS NOT NULL
          AND (SELECT public.is_gestor_for_polo(t.polo_id))
        )
      )
  ) THEN
    RAISE EXCEPTION 'Acesso ao cadastro acadêmico não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    p.id,
    p.nome,
    p.cpf_cnpj,
    p.data_nascimento,
    m.data_matricula,
    m.status,
    round(avg(v.frequencia_percent), 1),
    public.matricula_possui_lancamentos_academicos(m.id),
    (
      (t.data_inicio IS NULL OR t.data_inicio > CURRENT_DATE)
      AND NOT public.matricula_possui_lancamentos_academicos(m.id)
    )
  FROM public.matriculas m
  JOIN public.turmas t ON t.id = m.turma_id
  JOIN public.parceiros p ON p.id = m.aluno_id
  LEFT JOIN public.v_diario_notas_resultados v
    ON v.turma_id = m.turma_id
   AND v.aluno_id = m.aluno_id
  WHERE m.turma_id = p_turma_id
  GROUP BY
    m.id,
    t.data_inicio,
    p.id,
    p.nome,
    p.cpf_cnpj,
    p.data_nascimento,
    m.data_matricula,
    m.status
  ORDER BY p.nome;
END;
$$;

REVOKE ALL ON FUNCTION public.get_turma_alunos_academico(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_turma_alunos_academico(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_turma_alunos_academico(uuid) IS
  'Cadastro acadêmico completo, restrito a service_role ou gestor autorizado para o polo da turma.';

CREATE OR REPLACE FUNCTION public.get_diario_alunos(
  p_turma_id uuid,
  p_disciplina_id uuid
)
RETURNS TABLE (
  matricula_id uuid,
  aluno_id uuid,
  nome text,
  data_matricula timestamptz,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_autorizado boolean := false;
BEGIN
  SELECT
    coalesce((SELECT auth.role()), '') = 'service_role'
    OR (
      t.polo_id IS NOT NULL
      AND (SELECT public.is_gestor_for_polo(t.polo_id))
    )
    OR td.professor_id = (SELECT public.current_professor_id())
  INTO v_autorizado
  FROM public.turmas t
  JOIN public.turmas_disciplinas td
    ON td.turma_id = t.id
   AND td.disciplina_id = p_disciplina_id
  WHERE t.id = p_turma_id;

  IF NOT coalesce(v_autorizado, false) THEN
    RAISE EXCEPTION 'Acesso ao diário não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.aluno_id,
    p.nome,
    m.data_matricula,
    m.status
  FROM public.matriculas m
  JOIN public.parceiros p ON p.id = m.aluno_id
  WHERE m.turma_id = p_turma_id
    AND upper(coalesce(m.status, '')) NOT IN (
      'CANCELADO',
      'DESISTENTE',
      'TRANSFERIDO'
    )
  ORDER BY p.nome, m.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_diario_alunos(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_diario_alunos(uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_diario_alunos(uuid, uuid) IS
  'Roster mínimo do diário para gestor do polo ou professor vinculado à disciplina, inclusive para leitura histórica.';

CREATE OR REPLACE FUNCTION public.get_estagio_alunos_contexto(
  p_turma_id uuid,
  p_disciplina_id uuid
)
RETURNS TABLE (
  matricula_id uuid,
  aluno_id uuid,
  nome text,
  status_matricula text,
  vacinas_exigidas boolean,
  vacinas_liberadas boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_autorizado boolean := false;
BEGIN
  SELECT
    coalesce((SELECT auth.role()), '') = 'service_role'
    OR (
      t.polo_id IS NOT NULL
      AND (SELECT public.is_gestor_for_polo(t.polo_id))
    )
    OR td.professor_id = (SELECT public.current_professor_id())
  INTO v_autorizado
  FROM public.turmas t
  JOIN public.cursos c ON c.id = t.curso_id
  JOIN public.turmas_disciplinas td
    ON td.turma_id = t.id
   AND td.disciplina_id = p_disciplina_id
  JOIN public.disciplinas d ON d.id = td.disciplina_id
  WHERE t.id = p_turma_id
    AND c.modalidade = 'TECNICO'
    AND coalesce(d.carga_horaria_estagio, 0) > 0;

  IF NOT coalesce(v_autorizado, false) THEN
    RAISE EXCEPTION 'Acesso ao contexto de estágio não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH config AS (
    SELECT
      c.id AS curso_id,
      lower(coalesce(c.vacinas_config ->> 'exigirCarteiraEstagio', 'false')) = 'true'
        AS exige,
      CASE
        WHEN jsonb_typeof(c.vacinas_config -> 'vacinas') = 'array'
          THEN c.vacinas_config -> 'vacinas'
        ELSE '[]'::jsonb
      END AS vacinas
    FROM public.turmas t
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE t.id = p_turma_id
  ), obrigatorias AS (
    SELECT DISTINCT
      cfg.curso_id,
      vacina.item ->> 'codigo' AS codigo,
      (dose.item ->> 'numero')::integer AS numero
    FROM config cfg
    CROSS JOIN LATERAL jsonb_array_elements(cfg.vacinas) vacina(item)
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(vacina.item -> 'doses') = 'array'
          THEN vacina.item -> 'doses'
        ELSE '[]'::jsonb
      END
    ) dose(item)
    WHERE cfg.exige
      AND lower(coalesce(vacina.item ->> 'obrigatoria', 'true')) <> 'false'
      AND nullif(btrim(vacina.item ->> 'codigo'), '') IS NOT NULL
      AND coalesce(dose.item ->> 'numero', '') ~ '^[0-9]+$'
  ), alunos AS (
    SELECT m.id, m.aluno_id, p.nome, m.status
    FROM public.matriculas m
    JOIN public.parceiros p ON p.id = m.aluno_id
    WHERE m.turma_id = p_turma_id
      AND upper(coalesce(m.status, '')) NOT IN (
        'CANCELADO',
        'DESISTENTE',
        'TRANSFERIDO'
      )
  )
  SELECT
    a.id,
    a.aluno_id,
    a.nome,
    a.status,
    (cfg.exige AND count(o.codigo) > 0),
    (
      NOT (cfg.exige AND count(o.codigo) > 0)
      OR count(o.codigo) = count(o.codigo) FILTER (WHERE av.id IS NOT NULL)
    )
  FROM alunos a
  CROSS JOIN config cfg
  LEFT JOIN obrigatorias o ON o.curso_id = cfg.curso_id
  LEFT JOIN public.aluno_vacinas av
    ON av.aluno_id = a.aluno_id
   AND av.curso_id = o.curso_id
   AND av.vacina_codigo = o.codigo
   AND av.dose_numero = o.numero
   AND av.status = 'aprovado'
  GROUP BY a.id, a.aluno_id, a.nome, a.status, cfg.exige
  ORDER BY a.nome, a.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_estagio_alunos_contexto(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_estagio_alunos_contexto(uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_estagio_alunos_contexto(uuid, uuid) IS
  'Roster mínimo e situação vacinal agregada para gestor ou professor vinculado a disciplina com estágio; não expõe doses nem comprovantes.';
