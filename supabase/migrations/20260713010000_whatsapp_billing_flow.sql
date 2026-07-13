-- Deterministic WhatsApp billing flow for student self-service.

CREATE TABLE IF NOT EXISTS public.whatsapp_flow_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL DEFAULT 'default',
  enabled BOOLEAN NOT NULL DEFAULT false,
  max_attempts INTEGER NOT NULL DEFAULT 2 CHECK (max_attempts BETWEEN 1 AND 5),
  welcome_message TEXT NOT NULL DEFAULT 'Olá! Sou o atendimento automático da Universo Cursos. Para localizar seu cadastro com segurança, informe seu CPF.',
  invalid_cpf_message TEXT NOT NULL DEFAULT 'Não consegui validar esse CPF. Envie apenas os 11 números ou no formato 000.000.000-00.',
  mismatch_message TEXT NOT NULL DEFAULT 'Não consegui confirmar telefone e CPF no mesmo cadastro. Vou encaminhar sua conversa para um atendente.',
  menu_message TEXT NOT NULL DEFAULT 'Cadastro localizado. Escolha uma opção:\n\n1 - Receber link/boleto de pagamento\n2 - Receber PIX copia e cola\n3 - Falar com atendente',
  receivable_choice_message TEXT NOT NULL DEFAULT 'Encontrei mais de uma parcela em aberto. Responda com o número da parcela que deseja pagar:',
  no_receivables_message TEXT NOT NULL DEFAULT 'Não encontrei parcelas abertas, vencidas ou próximas do vencimento com dados de pagamento disponíveis. Vou encaminhar para um atendente conferir.',
  fallback_message TEXT NOT NULL DEFAULT 'Não consegui entender sua resposta. Escolha uma das opções do menu.',
  handoff_message TEXT NOT NULL DEFAULT 'Vou encaminhar sua conversa para um atendente. Em breve alguém da equipe irá continuar o atendimento.',
  link_intro_message TEXT NOT NULL DEFAULT 'Segue o link de pagamento da parcela selecionada.',
  pix_intro_message TEXT NOT NULL DEFAULT 'Segue o PIX copia e cola da parcela selecionada.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_flow_settings_scope_unique UNIQUE (scope)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_flow_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID NOT NULL REFERENCES public.whatsapp_conversas(id) ON DELETE CASCADE,
  telefone TEXT NOT NULL,
  aluno_id UUID REFERENCES public.parceiros(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_cpf'
    CHECK (status IN ('awaiting_cpf', 'menu', 'choosing_receivable', 'handoff', 'closed')),
  verified_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  selected_payment_method TEXT CHECK (selected_payment_method IS NULL OR selected_payment_method IN ('link', 'pix')),
  handoff_required BOOLEAN NOT NULL DEFAULT false,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_flow_sessions_conversa_unique UNIQUE (conversa_id)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_flow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.whatsapp_flow_sessions(id) ON DELETE SET NULL,
  conversa_id UUID REFERENCES public.whatsapp_conversas(id) ON DELETE CASCADE,
  aluno_id UUID REFERENCES public.parceiros(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_flow_sessions_status
  ON public.whatsapp_flow_sessions (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_flow_sessions_telefone
  ON public.whatsapp_flow_sessions (telefone);

CREATE INDEX IF NOT EXISTS idx_whatsapp_flow_events_conversa
  ON public.whatsapp_flow_events (conversa_id, created_at DESC);

INSERT INTO public.whatsapp_flow_settings (scope)
VALUES ('default')
ON CONFLICT (scope) DO NOTHING;

ALTER TABLE public.whatsapp_flow_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_flow_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_flow_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_whatsapp_flow_settings_gestor" ON public.whatsapp_flow_settings;
CREATE POLICY "portal_whatsapp_flow_settings_gestor"
  ON public.whatsapp_flow_settings FOR ALL TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

DROP POLICY IF EXISTS "portal_whatsapp_flow_sessions_gestor" ON public.whatsapp_flow_sessions;
CREATE POLICY "portal_whatsapp_flow_sessions_gestor"
  ON public.whatsapp_flow_sessions FOR ALL TO authenticated
  USING (public.is_gestor())
  WITH CHECK (public.is_gestor());

DROP POLICY IF EXISTS "portal_whatsapp_flow_events_gestor_read" ON public.whatsapp_flow_events;
CREATE POLICY "portal_whatsapp_flow_events_gestor_read"
  ON public.whatsapp_flow_events FOR SELECT TO authenticated
  USING (public.is_gestor());

REVOKE ALL ON public.whatsapp_flow_settings FROM anon;
REVOKE ALL ON public.whatsapp_flow_sessions FROM anon;
REVOKE ALL ON public.whatsapp_flow_events FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_flow_settings TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_flow_sessions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_flow_events TO service_role;
GRANT SELECT ON public.whatsapp_flow_events TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_flow_settings;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_flow_sessions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
