-- Versao registrada pelo MCP Supabase: 20260725114433.
CREATE INDEX IF NOT EXISTS idx_documentos_aluno_eventos_ator_usuario
  ON public.documentos_aluno_eventos (ator_usuario_id)
  WHERE ator_usuario_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_aluno_exclusoes_aluno
  ON public.documentos_aluno_exclusoes (aluno_id);

CREATE INDEX IF NOT EXISTS idx_documentos_aluno_exclusoes_solicitado_por
  ON public.documentos_aluno_exclusoes (solicitado_por)
  WHERE solicitado_por IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_aluno_versoes_revisado_por
  ON public.documentos_aluno_versoes (revisado_por)
  WHERE revisado_por IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documentos_aluno_versoes_arquivado_por
  ON public.documentos_aluno_versoes (arquivado_por)
  WHERE arquivado_por IS NOT NULL;
