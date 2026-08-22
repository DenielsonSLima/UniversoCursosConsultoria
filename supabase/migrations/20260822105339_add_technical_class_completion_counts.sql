-- O contador do card de turma reflete o estado acadêmico explicitamente
-- concluído na grade/fechamento do diário, em uma única RPC para todas as turmas.

CREATE FUNCTION public.get_gestao_turmas_completion_counts(
  p_turma_ids uuid[]
)
RETURNS TABLE (
  turma_id uuid,
  total_disciplinas bigint,
  disciplinas_concluidas bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    t.id AS turma_id,
    count(d.id)::bigint AS total_disciplinas,
    count(d.id) FILTER (WHERE coalesce(td.concluida, false))::bigint AS disciplinas_concluidas
  FROM public.turmas t
  LEFT JOIN public.modulos m ON m.curso_id = t.curso_id
  LEFT JOIN public.disciplinas d ON d.modulo_id = m.id
  LEFT JOIN public.turmas_disciplinas td
    ON td.turma_id = t.id
   AND td.disciplina_id = d.id
  WHERE t.id = ANY(coalesce(p_turma_ids, ARRAY[]::uuid[]))
  GROUP BY t.id;
$$;

REVOKE ALL ON FUNCTION public.get_gestao_turmas_completion_counts(uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_gestao_turmas_completion_counts(uuid[])
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_gestao_turmas_completion_counts(uuid[]) IS
  'Retorna, em lote, disciplinas concluídas explicitamente e total da grade para os cards de turmas técnicas.';
