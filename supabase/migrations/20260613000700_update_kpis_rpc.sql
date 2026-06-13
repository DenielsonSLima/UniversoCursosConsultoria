-- Migration: update get_parceiros_kpis RPC to calculate active/inactive counts

BEGIN;

DROP FUNCTION IF EXISTS public.get_parceiros_kpis();

CREATE OR REPLACE FUNCTION public.get_parceiros_kpis()
RETURNS TABLE (
  total_parceiros BIGINT,
  total_parceiros_ativos BIGINT,
  total_alunos BIGINT,
  total_alunos_ativos BIGINT,
  total_alunos_inativos BIGINT,
  total_professores BIGINT,
  total_professores_ativos BIGINT,
  total_professores_inativos BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(COUNT(*), 0)::BIGINT AS total_parceiros,
    COALESCE(COUNT(*) FILTER (WHERE status = 'ATIVO'), 0)::BIGINT AS total_parceiros_ativos,
    COALESCE(COUNT(*) FILTER (WHERE tipo = 'Aluno'), 0)::BIGINT AS total_alunos,
    COALESCE(COUNT(*) FILTER (WHERE tipo = 'Aluno' AND status = 'ATIVO'), 0)::BIGINT AS total_alunos_ativos,
    COALESCE(COUNT(*) FILTER (WHERE tipo = 'Aluno' AND (status = 'INATIVO' OR status = 'CANCELADO' OR status = 'DESISTENTE')), 0)::BIGINT AS total_alunos_inativos,
    COALESCE(COUNT(*) FILTER (WHERE tipo = 'Professor'), 0)::BIGINT AS total_professores,
    COALESCE(COUNT(*) FILTER (WHERE tipo = 'Professor' AND status = 'ATIVO'), 0)::BIGINT AS total_professores_ativos,
    COALESCE(COUNT(*) FILTER (WHERE tipo = 'Professor' AND status = 'INATIVO'), 0)::BIGINT AS total_professores_inativos
  FROM public.parceiros;
END;
$$ LANGUAGE plpgsql;

COMMIT;
