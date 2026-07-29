BEGIN;
-- Versão registrada pelo MCP Supabase: 20260729205028.

CREATE INDEX diario_matriculas_roster_matricula_scope_idx
  ON public.diario_matriculas_roster
  (matricula_id, turma_id, aluno_id);

CREATE INDEX documentos_recebimentos_sem_anexo_documento_aluno_idx
  ON public.documentos_aluno_recebimentos_sem_anexo
  (documento_id, aluno_id);

CREATE INDEX documentos_recebimentos_sem_anexo_recebido_por_idx
  ON public.documentos_aluno_recebimentos_sem_anexo
  (recebido_por_usuario_id)
  WHERE recebido_por_usuario_id IS NOT NULL;

CREATE INDEX documentos_recebimentos_sem_anexo_revogado_por_idx
  ON public.documentos_aluno_recebimentos_sem_anexo
  (revogado_por_usuario_id)
  WHERE revogado_por_usuario_id IS NOT NULL;

COMMIT;
