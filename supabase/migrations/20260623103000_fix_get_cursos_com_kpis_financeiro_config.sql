DROP FUNCTION IF EXISTS public.get_cursos_com_kpis(TEXT);

CREATE OR REPLACE FUNCTION public.get_cursos_com_kpis(p_modalidade TEXT)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  modalidade TEXT,
  carga_horaria INTEGER,
  status TEXT,
  created_at TIMESTAMPTZ,
  area TEXT,
  descricao TEXT,
  versao TEXT,
  parceiro_instituicao TEXT,
  parceiro_logo_url TEXT,
  imagem_url TEXT,
  duracao_meses INTEGER,
  carga_horaria_cadastrada NUMERIC,
  total_turmas BIGINT,
  publicar_site BOOLEAN,
  imagem_detalhe_1 TEXT,
  imagem_detalhe_2 TEXT,
  valor NUMERIC,
  ead_config JSONB,
  asaas_payment_link_id TEXT,
  asaas_payment_link_url TEXT,
  asaas_link_status TEXT,
  asaas_link_updated_at TIMESTAMPTZ,
  financeiro_config JSONB
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id,
    c.nome::TEXT,
    c.modalidade::TEXT,
    c.carga_horaria,
    c.status::TEXT,
    c.created_at,
    c.area::TEXT,
    c.descricao::TEXT,
    c.versao::TEXT,
    c.parceiro_instituicao::TEXT,
    c.parceiro_logo_url::TEXT,
    c.imagem_url::TEXT,
    c.duracao_meses,
    COALESCE((
      SELECT SUM(d.carga_horaria)
      FROM public.modulos m
      JOIN public.disciplinas d ON d.modulo_id = m.id
      WHERE m.curso_id = c.id
    ), 0)::NUMERIC AS carga_horaria_cadastrada,
    COALESCE((
      SELECT COUNT(*)
      FROM public.turmas t
      WHERE t.curso_id = c.id
    ), 0)::BIGINT AS total_turmas,
    COALESCE(c.publicar_site, false) AS publicar_site,
    c.imagem_detalhe_1::TEXT,
    c.imagem_detalhe_2::TEXT,
    c.valor,
    c.ead_config,
    c.asaas_payment_link_id::TEXT,
    c.asaas_payment_link_url::TEXT,
    c.asaas_link_status::TEXT,
    c.asaas_link_updated_at,
    c.financeiro_config
  FROM public.cursos c
  WHERE c.modalidade = p_modalidade
  ORDER BY c.nome ASC;
$$;
