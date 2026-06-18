-- Migração: Refatoração de Cursos Técnicos (Campos, Restrições e RPC KPIs)
-- Autor: Antigravity

-- 1. Adicionar coluna duracao_meses na tabela de cursos se não existir
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS duracao_meses INTEGER;

-- 2. Atualizar registros existentes com padrão de meses coerente
UPDATE public.cursos 
SET duracao_meses = CASE 
  WHEN carga_horaria >= 1200 THEN 24 
  ELSE 18 
END
WHERE duracao_meses IS NULL AND modalidade = 'TECNICO';

-- 3. Atualizar restrição de exclusão na tabela turmas de CASCADE para RESTRICT
ALTER TABLE public.turmas DROP CONSTRAINT IF EXISTS turmas_curso_id_fkey;
ALTER TABLE public.turmas ADD CONSTRAINT turmas_curso_id_fkey FOREIGN KEY (curso_id) REFERENCES public.cursos(id) ON DELETE RESTRICT;

-- 4. RPC para obter cursos com informações de KPIs de grade e contagem de turmas
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
  total_turmas bigint
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
    )::bigint as total_turmas
  FROM public.cursos c
  WHERE c.modalidade = p_modalidade
  ORDER BY c.nome ASC;
END;
$$ LANGUAGE plpgsql;

-- 5. RPC para obter KPIs da grade curricular de um curso específico (Total, Cadastrada, Restante)
CREATE OR REPLACE FUNCTION get_curso_grade_kpis(p_curso_id uuid)
RETURNS TABLE (
  carga_horaria_total integer,
  carga_horaria_cadastrada integer,
  carga_horaria_restante integer
) AS $$
DECLARE
  v_total integer;
  v_cadastrada integer;
BEGIN
  -- Obter a carga horária total do curso
  SELECT c.carga_horaria INTO v_total
  FROM public.cursos c
  WHERE c.id = p_curso_id;

  -- Calcular a carga horária cadastrada na grade
  SELECT COALESCE(SUM(d.carga_horaria), 0)::integer INTO v_cadastrada
  FROM public.modulos m
  JOIN public.disciplinas d ON d.modulo_id = m.id
  WHERE m.curso_id = p_curso_id;

  RETURN QUERY
  SELECT 
    COALESCE(v_total, 0),
    v_cadastrada,
    (COALESCE(v_total, 0) - v_cadastrada);
END;
$$ LANGUAGE plpgsql;
