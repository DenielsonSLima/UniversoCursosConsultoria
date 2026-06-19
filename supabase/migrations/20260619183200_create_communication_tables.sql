-- Migration: 20260619183200_create_communication_tables.sql
-- Description: Create communication tables for real-time customer service and chatbot/auto-attendant config.

-- 1. TABELA: CATEGORIAS DE COMUNICAÇÃO (SETORES)
CREATE TABLE IF NOT EXISTS public.comunicacao_categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  cor TEXT DEFAULT '#001a33',
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. TABELA: CONFIGURAÇÕES DE COMUNICAÇÃO
CREATE TABLE IF NOT EXISTS public.comunicacao_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem_boas_vindas TEXT NOT NULL DEFAULT 'Olá! Como podemos te ajudar hoje? Por favor, escolha uma categoria para iniciar o seu atendimento:',
  whatsapp_conectado BOOLEAN DEFAULT false,
  whatsapp_numero TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. TABELA: CHATS / ATENDIMENTOS ABERTOS
CREATE TABLE IF NOT EXISTS public.comunicacao_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remetente_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  remetente_nome TEXT NOT NULL,
  remetente_tipo TEXT NOT NULL CHECK (remetente_tipo IN ('Aluno', 'Professor')),
  categoria_id UUID REFERENCES public.comunicacao_categorias(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'solucionada')),
  ultimo_texto TEXT,
  ultima_data TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. TABELA: MENSAGENS DO CHAT
CREATE TABLE IF NOT EXISTS public.comunicacao_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.comunicacao_chats(id) ON DELETE CASCADE,
  remetente_id UUID, -- NULL se for mensagem do sistema/bot automático
  remetente_nome TEXT NOT NULL, -- "Sistema", nome do aluno, ou nome do gestor
  remetente_tipo TEXT NOT NULL CHECK (remetente_tipo IN ('aluno', 'professor', 'gestor', 'sistema')),
  conteudo TEXT NOT NULL,
  anexo_url TEXT,
  lida BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ========================================================
-- SEGURANÇA (RLS)
-- ========================================================
ALTER TABLE public.comunicacao_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acesso total local categorias" ON public.comunicacao_categorias FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total local config" ON public.comunicacao_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total local chats" ON public.comunicacao_chats FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total local mensagens" ON public.comunicacao_mensagens FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- REALTIME
-- ========================================================
BEGIN;
  -- Remove tables if already added to avoid errors
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.comunicacao_categorias;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.comunicacao_config;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.comunicacao_chats;
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.comunicacao_mensagens;

  -- Add tables
  ALTER PUBLICATION supabase_realtime ADD TABLE public.comunicacao_categorias;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.comunicacao_config;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.comunicacao_chats;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.comunicacao_mensagens;
COMMIT;

-- ========================================================
-- SEED DE CONFIGURAÇÃO E CATEGORIAS
-- ========================================================
INSERT INTO public.comunicacao_config (mensagem_boas_vindas) VALUES 
('Olá! Bem-vindo ao atendimento da Universo Cursos. Para direcionarmos você ao setor correto, escolha uma das categorias abaixo:');

INSERT INTO public.comunicacao_categorias (nome, descricao, cor) VALUES
('Financeira', 'Questões relacionadas a boletos, parcelas, pagamentos e taxas.', '#7c3aed'),
('Secretaria', 'Solicitação de certidões, matrículas, histórico e documentos.', '#059669'),
('Pedagógica', 'Dúvidas sobre disciplinas, notas, calendários ou TCC.', '#d97706'),
('Suporte', 'Problemas com o acesso ao portal, erros técnicos ou EAD.', '#dc2626');
