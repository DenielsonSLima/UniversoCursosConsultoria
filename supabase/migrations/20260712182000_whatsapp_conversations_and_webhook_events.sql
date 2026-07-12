-- WhatsApp external inbox: conversations, messages and webhook event journal.

CREATE TABLE IF NOT EXISTS public.whatsapp_conversas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID REFERENCES public.parceiros(id) ON DELETE SET NULL,
  contato_nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'arquivada')),
  ultimo_texto TEXT,
  ultima_data TIMESTAMPTZ NOT NULL DEFAULT now(),
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_conversas_telefone_unique UNIQUE (telefone)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID NOT NULL REFERENCES public.whatsapp_conversas(id) ON DELETE CASCADE,
  aluno_id UUID REFERENCES public.parceiros(id) ON DELETE SET NULL,
  meta_message_id TEXT,
  direcao TEXT NOT NULL CHECK (direcao IN ('entrada', 'saida', 'status')),
  remetente_tipo TEXT NOT NULL CHECK (remetente_tipo IN ('aluno', 'gestor', 'sistema')),
  remetente_nome TEXT NOT NULL,
  conteudo TEXT NOT NULL DEFAULT '',
  message_type TEXT NOT NULL DEFAULT 'text',
  status TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  lida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_mensagens_meta_message_unique UNIQUE (meta_message_id)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT,
  field TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversas_ultima_data
  ON public.whatsapp_conversas (ultima_data DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_conversa_created
  ON public.whatsapp_mensagens (conversa_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_aluno
  ON public.whatsapp_mensagens (aluno_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_events_received
  ON public.whatsapp_webhook_events (received_at DESC);

ALTER TABLE public.whatsapp_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_whatsapp_conversas_gestor" ON public.whatsapp_conversas;
CREATE POLICY "portal_whatsapp_conversas_gestor"
  ON public.whatsapp_conversas FOR ALL TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

DROP POLICY IF EXISTS "portal_whatsapp_mensagens_gestor" ON public.whatsapp_mensagens;
CREATE POLICY "portal_whatsapp_mensagens_gestor"
  ON public.whatsapp_mensagens FOR ALL TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

DROP POLICY IF EXISTS "portal_whatsapp_webhook_events_gestor_read" ON public.whatsapp_webhook_events;
CREATE POLICY "portal_whatsapp_webhook_events_gestor_read"
  ON public.whatsapp_webhook_events FOR SELECT TO authenticated
  USING (public.is_gestor());

REVOKE ALL ON public.whatsapp_conversas FROM anon;
REVOKE ALL ON public.whatsapp_mensagens FROM anon;
REVOKE ALL ON public.whatsapp_webhook_events FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_conversas TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_mensagens TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_webhook_events TO service_role;
GRANT SELECT ON public.whatsapp_webhook_events TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversas;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_mensagens;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
