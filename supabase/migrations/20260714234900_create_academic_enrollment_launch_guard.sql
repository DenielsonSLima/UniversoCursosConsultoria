-- Helper reproduzível para impedir exclusão de matrícula com histórico acadêmico.

CREATE OR REPLACE FUNCTION public.matricula_possui_lancamentos_academicos(
  p_matricula_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH matricula AS (
    SELECT id, aluno_id, turma_id FROM public.matriculas
    WHERE id = p_matricula_id
  )
  SELECT EXISTS (
      SELECT 1 FROM public.diario_frequencia df JOIN matricula m
        ON m.turma_id = df.turma_id AND m.aluno_id = df.aluno_id
    ) OR EXISTS (
      SELECT 1 FROM public.diario_notas dn JOIN matricula m
        ON m.turma_id = dn.turma_id AND m.aluno_id = dn.aluno_id
    ) OR EXISTS (
      SELECT 1 FROM public.matriculas_estagios me JOIN matricula m
        ON m.turma_id = me.turma_id AND m.aluno_id = me.aluno_id
    ) OR EXISTS (
      SELECT 1 FROM public.matricula_aproveitamentos
      WHERE matricula_id = p_matricula_id
    ) OR EXISTS (
      SELECT 1 FROM public.certificados_academicos
      WHERE matricula_id = p_matricula_id
    ) OR EXISTS (
      SELECT 1 FROM public.matricula_movimentacoes
      WHERE matricula_id = p_matricula_id AND tipo <> 'MATRICULA'
    ) OR EXISTS (
      SELECT 1 FROM public.transferencias_academicas
      WHERE matricula_origem_id = p_matricula_id
        OR matricula_destino_id = p_matricula_id
    );
$$;

REVOKE EXECUTE ON FUNCTION public.matricula_possui_lancamentos_academicos(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.matricula_possui_lancamentos_academicos(uuid)
  TO service_role;
