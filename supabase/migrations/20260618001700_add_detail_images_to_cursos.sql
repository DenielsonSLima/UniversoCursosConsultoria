-- Migração: Adicionar colunas para fotos de detalhes e atualizar a RPC get_cursos_com_kpis
-- Autor: Antigravity

-- 1. Adicionar colunas imagem_detalhe_1 e imagem_detalhe_2 na tabela de cursos se não existirem
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS imagem_detalhe_1 TEXT;
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS imagem_detalhe_2 TEXT;

-- 2. Atualizar a RPC get_cursos_com_kpis para incluir as novas colunas
DROP FUNCTION IF EXISTS public.get_cursos_com_kpis(text);
CREATE OR REPLACE FUNCTION get_cursos_com_kpis(p_modalidade text)
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
  total_turmas bigint,
  publicar_site boolean,
  imagem_detalhe_1 text,
  imagem_detalhe_2 text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.nome,
    c.modalidade,
    c.carga_horaria,
    c.status,
    c.created_at,
    c.area,
    c.descricao,
    c.versao,
    c.parceiro_instituicao,
    c.parceiro_logo_url,
    c.imagem_url,
    c.duracao_meses,
    COALESCE((
      SELECT SUM(d.carga_horaria)
      FROM public.modulos m
      JOIN public.disciplinas d ON d.modulo_id = m.id
      WHERE m.curso_id = c.id
    ), 0)::numeric as carga_horaria_cadastrada,
    (
      SELECT COUNT(*)
      FROM public.turmas t
      WHERE t.curso_id = c.id
    )::bigint as total_turmas,
    c.publicar_site,
    c.imagem_detalhe_1,
    c.imagem_detalhe_2
  FROM public.cursos c
  WHERE c.modalidade = p_modalidade
  ORDER BY c.nome ASC;
END;
$$ LANGUAGE plpgsql;
