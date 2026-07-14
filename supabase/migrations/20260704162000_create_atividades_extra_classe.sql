-- Base segura de atividades extra-classe.
-- Esta migration pode ser aplicada isoladamente: libera somente leitura com RLS;
-- as escritas são habilitadas após o lifecycle, nas migrations de hardening.

CREATE TABLE IF NOT EXISTS public.atividades_extra_classe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  disciplina_id UUID NOT NULL REFERENCES public.disciplinas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL CHECK (length(btrim(titulo)) > 0),
  tema TEXT,
  tipo_resposta TEXT NOT NULL DEFAULT 'TEXTO'
    CHECK (tipo_resposta IN ('TEXTO', 'PERGUNTAS', 'ENVIO', 'MISTO')),
  texto TEXT,
  video_url TEXT
    CHECK (video_url IS NULL OR video_url ~* '^https?://[^[:space:]]+$'),
  perguntas JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(perguntas) = 'array'),
  carga_horaria_compensacao NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (carga_horaria_compensacao >= 0),
  prazo_entrega DATE,
  status TEXT NOT NULL DEFAULT 'PUBLICADA'
    CHECK (status IN ('RASCUNHO', 'PUBLICADA', 'ARQUIVADA')),
  criado_por_tipo TEXT
    CHECK (criado_por_tipo IS NULL OR criado_por_tipo IN ('GESTOR', 'PROFESSOR')),
  criado_por_id UUID REFERENCES public.parceiros(id) ON DELETE SET NULL,
  criado_por_auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  atualizado_por_auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.atividade_extra_classe_respostas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atividade_id UUID NOT NULL REFERENCES public.atividades_extra_classe(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  resposta_texto TEXT,
  respostas JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(respostas) = 'array'),
  anexo_url TEXT
    CHECK (anexo_url IS NULL OR anexo_url ~* '^https://[^[:space:]]+$'),
  status TEXT NOT NULL DEFAULT 'ENTREGUE'
    CHECK (status IN ('PENDENTE', 'ENTREGUE', 'CORRIGIDA')),
  nota NUMERIC(5,2) CHECK (nota IS NULL OR (nota >= 0 AND nota <= 10)),
  feedback TEXT,
  entregue_em TIMESTAMPTZ,
  entregue_por_auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  corrigido_em TIMESTAMPTZ,
  corrigido_por_auth_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (atividade_id, aluno_id)
);

CREATE INDEX IF NOT EXISTS idx_atividades_extra_turma_disciplina
  ON public.atividades_extra_classe (turma_id, disciplina_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atividades_extra_disciplina
  ON public.atividades_extra_classe (disciplina_id);
CREATE INDEX IF NOT EXISTS idx_atividades_extra_autor
  ON public.atividades_extra_classe (criado_por_id) WHERE criado_por_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_atividades_extra_auth_autor
  ON public.atividades_extra_classe (criado_por_auth_id) WHERE criado_por_auth_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_atividades_extra_turma_publicadas
  ON public.atividades_extra_classe (turma_id, prazo_entrega, created_at DESC)
  WHERE status = 'PUBLICADA';
CREATE INDEX IF NOT EXISTS idx_atividades_extra_turma_ativas
  ON public.atividades_extra_classe (turma_id, created_at DESC)
  WHERE status <> 'ARQUIVADA';
CREATE INDEX IF NOT EXISTS idx_atividade_extra_respostas_aluno
  ON public.atividade_extra_classe_respostas (aluno_id, atividade_id);
CREATE INDEX IF NOT EXISTS idx_atividade_extra_respostas_entregue_por
  ON public.atividade_extra_classe_respostas (entregue_por_auth_id)
  WHERE entregue_por_auth_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_atividade_extra_respostas_corrigido_por
  ON public.atividade_extra_classe_respostas (corrigido_por_auth_id)
  WHERE corrigido_por_auth_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matriculas_turma_aluno_status
  ON public.matriculas (turma_id, aluno_id, status);

ALTER TABLE public.atividades_extra_classe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atividade_extra_classe_respostas ENABLE ROW LEVEL SECURITY;

-- O helper é deliberadamente autocontido para permanecer seguro antes da
-- migration de lifecycle: aluno ativo só lê turma em andamento; histórico
-- concluído só é liberado quando a turma está finalizada.
CREATE OR REPLACE FUNCTION public.can_student_read_atividade_extra(p_turma_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.matriculas m
    JOIN public.turmas t ON t.id = m.turma_id
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE m.turma_id = p_turma_id
      AND m.aluno_id = (SELECT public.current_aluno_id())
      AND (
        (c.modalidade <> 'TECNICO'
          AND upper(coalesce(m.status, '')) IN ('ATIVO', 'CONCLUIDO'))
        OR
        (c.modalidade = 'TECNICO'
          AND upper(coalesce(t.status, '')) = 'EM_ANDAMENTO'
          AND upper(coalesce(m.status, '')) = 'ATIVO')
        OR
        (c.modalidade = 'TECNICO'
          AND upper(coalesce(t.status, '')) = 'FINALIZADA'
          AND upper(coalesce(m.status, '')) = 'CONCLUIDO')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_staff_read_atividade_extra(
  p_turma_id UUID,
  p_disciplina_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (SELECT public.can_write_turma(p_turma_id))
    OR (SELECT public.is_professor_assigned_disciplina(p_turma_id, p_disciplina_id));
$$;

REVOKE EXECUTE ON FUNCTION public.can_student_read_atividade_extra(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_staff_read_atividade_extra(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_student_read_atividade_extra(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_staff_read_atividade_extra(UUID, UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS "portal_atividades_extra_select" ON public.atividades_extra_classe;
CREATE POLICY "portal_atividades_extra_select"
  ON public.atividades_extra_classe FOR SELECT
  TO authenticated
  USING (
    (SELECT public.can_staff_read_atividade_extra(turma_id, disciplina_id))
    OR (
      status = 'PUBLICADA'
      AND (SELECT public.can_student_read_atividade_extra(turma_id))
    )
  );

DROP POLICY IF EXISTS "portal_atividades_extra_insert" ON public.atividades_extra_classe;
DROP POLICY IF EXISTS "portal_atividades_extra_update" ON public.atividades_extra_classe;
DROP POLICY IF EXISTS "portal_atividades_extra_delete" ON public.atividades_extra_classe;

DROP POLICY IF EXISTS "portal_atividade_extra_respostas_select"
  ON public.atividade_extra_classe_respostas;
CREATE POLICY "portal_atividade_extra_respostas_select"
  ON public.atividade_extra_classe_respostas FOR SELECT
  TO authenticated
  USING (
    (
      aluno_id = (SELECT public.current_aluno_id())
      AND EXISTS (
        SELECT 1
        FROM public.atividades_extra_classe ae
        WHERE ae.id = atividade_id
          AND ae.status = 'PUBLICADA'
          AND (SELECT public.can_student_read_atividade_extra(ae.turma_id))
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.atividades_extra_classe ae
      WHERE ae.id = atividade_id
        AND (SELECT public.can_staff_read_atividade_extra(ae.turma_id, ae.disciplina_id))
    )
  );

DROP POLICY IF EXISTS "portal_atividade_extra_respostas_insert"
  ON public.atividade_extra_classe_respostas;
DROP POLICY IF EXISTS "portal_atividade_extra_respostas_update"
  ON public.atividade_extra_classe_respostas;
DROP POLICY IF EXISTS "portal_atividade_extra_respostas_delete"
  ON public.atividade_extra_classe_respostas;

COMMENT ON FUNCTION public.can_student_read_atividade_extra(UUID)
  IS 'Acesso acadêmico seguro mesmo sem a migration posterior de lifecycle.';
