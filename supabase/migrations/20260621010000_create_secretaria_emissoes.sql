CREATE TABLE IF NOT EXISTS public.secretaria_emissoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  documento TEXT NOT NULL CHECK (
    documento IN (
      'declaracao_matricula',
      'declaracao_frequencia',
      'boletim',
      'declaracao_irpf',
      'historico_escolar',
      'cracha_estagio',
      'rematricula',
      'termo_estagio'
    )
  ),
  modo TEXT NOT NULL CHECK (modo IN ('individual', 'lote')),
  polo_id UUID NOT NULL REFERENCES public.polos(id) ON DELETE RESTRICT,
  emitido_por UUID,
  aluno_id UUID REFERENCES public.parceiros(id) ON DELETE SET NULL,
  matricula_id UUID REFERENCES public.matriculas(id) ON DELETE SET NULL,
  turma_id UUID REFERENCES public.turmas(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PREPARADO' CHECK (status IN ('PREPARADO', 'GERADO', 'CANCELADO')),
  arquivo_url TEXT,
  metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (modo = 'individual' AND aluno_id IS NOT NULL AND matricula_id IS NOT NULL)
    OR
    (modo = 'lote' AND turma_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS secretaria_emissoes_contexto_idx
  ON public.secretaria_emissoes (polo_id, emitido_por, documento, created_at DESC);

CREATE INDEX IF NOT EXISTS secretaria_emissoes_aluno_idx
  ON public.secretaria_emissoes (aluno_id, created_at DESC)
  WHERE aluno_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS secretaria_emissoes_turma_idx
  ON public.secretaria_emissoes (turma_id, created_at DESC)
  WHERE turma_id IS NOT NULL;

ALTER TABLE public.secretaria_emissoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso secretaria emissoes" ON public.secretaria_emissoes;
CREATE POLICY "Acesso secretaria emissoes"
  ON public.secretaria_emissoes
  FOR ALL
  USING (true)
  WITH CHECK (true);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.secretaria_emissoes;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
