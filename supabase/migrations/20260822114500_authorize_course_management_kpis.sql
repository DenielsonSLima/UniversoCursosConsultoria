-- KPIs de cursos deixam de depender das políticas amplas de SELECT: a RPC faz
-- a autorização de Cadastros e devolve o gabarito apenas ao gestor habilitado.

CREATE OR REPLACE FUNCTION public.get_cursos_com_kpis(p_modalidade text)
RETURNS TABLE (
  id uuid,
  nome text,
  modalidade text,
  carga_horaria integer,
  status text,
  created_at timestamptz,
  area text,
  descricao text,
  versao text,
  parceiro_instituicao text,
  parceiro_logo_url text,
  imagem_url text,
  duracao_meses integer,
  carga_horaria_cadastrada numeric,
  total_disciplinas bigint,
  total_turmas bigint,
  publicar_site boolean,
  imagem_detalhe_1 text,
  imagem_detalhe_2 text,
  valor numeric,
  ead_config jsonb,
  asaas_payment_link_id text,
  asaas_payment_link_url text,
  asaas_link_status text,
  asaas_link_updated_at timestamptz,
  financeiro_config jsonb,
  vacinas_config jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_modalidade text := upper(btrim(coalesce(p_modalidade, '')));
BEGIN
  IF v_modalidade NOT IN ('TECNICO', 'LIVRE', 'ESPECIALIZACAO', 'EAD', 'SUPERIOR') THEN
    RAISE EXCEPTION 'Modalidade de curso inválida.' USING ERRCODE = '23514';
  END IF;

  IF coalesce(auth.role(), '') <> 'service_role'
    AND NOT (
      public.is_gestor_global()
      AND public.gestor_can_manage_curso_modalidade(v_modalidade)
    )
  THEN
    RAISE EXCEPTION 'Sem permissão para consultar os cursos desta modalidade.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH requested_courses AS (
    SELECT c.*
    FROM public.cursos c
    WHERE c.modalidade = v_modalidade
  ), grade_kpis AS (
    SELECT
      m.curso_id,
      coalesce(sum(d.carga_horaria), 0)::numeric AS carga_horaria_cadastrada,
      count(d.id)::bigint AS total_disciplinas
    FROM public.modulos m
    JOIN requested_courses rc ON rc.id = m.curso_id
    JOIN public.disciplinas d ON d.modulo_id = m.id
    GROUP BY m.curso_id
  ), turma_kpis AS (
    SELECT t.curso_id, count(t.id)::bigint AS total_turmas
    FROM public.turmas t
    JOIN requested_courses rc ON rc.id = t.curso_id
    GROUP BY t.curso_id
  )
  SELECT
    c.id,
    c.nome::text,
    c.modalidade::text,
    c.carga_horaria,
    c.status::text,
    c.created_at,
    c.area::text,
    c.descricao::text,
    c.versao::text,
    c.parceiro_instituicao::text,
    c.parceiro_logo_url::text,
    c.imagem_url::text,
    c.duracao_meses,
    coalesce(gk.carga_horaria_cadastrada, 0)::numeric,
    coalesce(gk.total_disciplinas, 0)::bigint,
    coalesce(tk.total_turmas, 0)::bigint,
    coalesce(c.publicar_site, false),
    c.imagem_detalhe_1::text,
    c.imagem_detalhe_2::text,
    c.valor,
    CASE
      WHEN c.modalidade = 'EAD' THEN internal_academic.ead_restore_assessment_answers(
        c.ead_config,
        k.activity_answers,
        k.quiz_answers
      )
      ELSE c.ead_config
    END,
    c.asaas_payment_link_id::text,
    c.asaas_payment_link_url::text,
    c.asaas_link_status::text,
    c.asaas_link_updated_at,
    c.financeiro_config,
    coalesce(
      c.vacinas_config,
      '{"exigirCarteiraEstagio":false,"vacinas":[]}'::jsonb
    )
  FROM requested_courses c
  LEFT JOIN grade_kpis gk ON gk.curso_id = c.id
  LEFT JOIN turma_kpis tk ON tk.curso_id = c.id
  LEFT JOIN internal_academic.ead_assessment_answer_keys k
    ON k.course_id = c.id
   AND c.modalidade = 'EAD'
  ORDER BY c.nome ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_cursos_com_kpis(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_cursos_com_kpis(text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_cursos_com_kpis(text) IS
  'KPIs de cursos limitados ao gestor global autorizado; EAD é reconstituído apenas nesta fronteira.';
