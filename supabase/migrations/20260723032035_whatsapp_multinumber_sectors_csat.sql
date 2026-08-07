-- Espelho local da migration aplicada pelo MCP em 2026-07-23.
CREATE TABLE IF NOT EXISTS public.whatsapp_conexoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  instituicao TEXT NOT NULL DEFAULT 'universo',
  telefone TEXT,
  phone_number_id TEXT,
  waba_id TEXT,
  is_default BOOLEAN DEFAULT false,
  is_matriz_financeira BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'ativo',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.whatsapp_conexoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_conexoes_all ON public.whatsapp_conexoes;
CREATE POLICY whatsapp_conexoes_all
  ON public.whatsapp_conexoes
  FOR ALL
  USING (true)
  WITH CHECK (true);

INSERT INTO public.whatsapp_conexoes
  (nome, instituicao, is_default, is_matriz_financeira, status)
SELECT 'Universo Principal', 'universo', true, true, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.whatsapp_conexoes WHERE instituicao = 'universo'
);

INSERT INTO public.whatsapp_conexoes
  (nome, instituicao, is_default, is_matriz_financeira, status)
SELECT 'Anhanguera', 'anhanguera', false, false, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.whatsapp_conexoes WHERE instituicao = 'anhanguera'
);

INSERT INTO public.whatsapp_conexoes
  (nome, instituicao, is_default, is_matriz_financeira, status)
SELECT 'Unopar', 'unopar', false, false, 'ativo'
WHERE NOT EXISTS (
  SELECT 1 FROM public.whatsapp_conexoes WHERE instituicao = 'unopar'
);

ALTER TABLE public.whatsapp_conversas
  ADD COLUMN IF NOT EXISTS conexao_id UUID
    REFERENCES public.whatsapp_conexoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS setor TEXT DEFAULT 'atendimento_geral',
  ADD COLUMN IF NOT EXISTS polo_id UUID REFERENCES public.polos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS atendente_id UUID
    REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS instituicao TEXT DEFAULT 'universo',
  ADD COLUMN IF NOT EXISTS status_atendimento TEXT DEFAULT 'bot_triagem',
  ADD COLUMN IF NOT EXISTS sub_assunto TEXT,
  ADD COLUMN IF NOT EXISTS tempo_primeira_resposta_seg INTEGER,
  ADD COLUMN IF NOT EXISTS tempo_total_atendimento_seg INTEGER,
  ADD COLUMN IF NOT EXISTS csat_score INTEGER,
  ADD COLUMN IF NOT EXISTS csat_comentario TEXT,
  ADD COLUMN IF NOT EXISTS data_inicio_atendimento TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS data_fim_atendimento TIMESTAMPTZ;

ALTER TABLE public.usuarios_sistema
  ADD COLUMN IF NOT EXISTS setor_comunicacao TEXT DEFAULT 'todos',
  ADD COLUMN IF NOT EXISTS polo_comunicacao_id UUID
    REFERENCES public.polos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pode_visualizar_todos_setores BOOLEAN DEFAULT true;
