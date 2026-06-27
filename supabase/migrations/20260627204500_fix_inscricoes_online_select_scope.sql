-- Keep online enrollment reads scoped to the student or the responsible gestor.

DROP POLICY IF EXISTS "portal_inscricoes_online_select" ON public.inscricoes_online;
CREATE POLICY "portal_inscricoes_online_select"
  ON public.inscricoes_online FOR SELECT TO authenticated
  USING (
    aluno_id = public.current_aluno_id()
    OR public.can_write_turma(turma_id)
    OR (turma_id IS NULL AND public.is_gestor_global())
  );
