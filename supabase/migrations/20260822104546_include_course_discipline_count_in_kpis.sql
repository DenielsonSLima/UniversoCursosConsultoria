-- Os cards de cursos recebem a quantidade de disciplinas já agregada pelo banco.
-- O frontend apenas apresenta o valor retornado pela RPC.

DROP FUNCTION IF EXISTS public.get_cursos_com_kpis(text);

CREATE FUNCTION public.get_cursos_com_kpis(p_modalidade text)
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
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH grade_kpis AS (
    SELECT
      m.curso_id,
      coalesce(sum(d.carga_horaria), 0)::numeric AS carga_horaria_cadastrada,
      count(d.id)::bigint AS total_disciplinas
    FROM public.modulos m
    JOIN public.disciplinas d ON d.modulo_id = m.id
    GROUP BY m.curso_id
  ), turma_kpis AS (
    SELECT
      t.curso_id,
      count(t.id)::bigint AS total_turmas
    FROM public.turmas t
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
    c.ead_config,
    c.asaas_payment_link_id::text,
    c.asaas_payment_link_url::text,
    c.asaas_link_status::text,
    c.asaas_link_updated_at,
    c.financeiro_config,
    coalesce(c.vacinas_config, '{"exigirCarteiraEstagio":false,"vacinas":[]}'::jsonb)
  FROM public.cursos c
  LEFT JOIN grade_kpis gk ON gk.curso_id = c.id
  LEFT JOIN turma_kpis tk ON tk.curso_id = c.id
  WHERE c.modalidade = p_modalidade
  ORDER BY c.nome ASC;
$$;

REVOKE ALL ON FUNCTION public.get_cursos_com_kpis(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_cursos_com_kpis(text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_cursos_com_kpis(text) IS
  'Lista cursos com KPIs autoritativos de carga, disciplinas e turmas para os cards de gestão.';
