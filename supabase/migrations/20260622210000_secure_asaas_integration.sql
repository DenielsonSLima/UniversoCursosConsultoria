-- Integração segura com o Asaas.
-- A chave fica criptografada no Supabase Vault e nunca é exposta pelas tabelas públicas.

ALTER TABLE public.asaas_config
  ADD COLUMN IF NOT EXISTS configured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_test_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_test_status TEXT,
  ADD COLUMN IF NOT EXISTS last_test_message TEXT;

UPDATE public.asaas_config
SET api_key = NULL,
    configured = FALSE;

DROP POLICY IF EXISTS "Acesso total local asaas_config" ON public.asaas_config;
CREATE POLICY "Consulta autenticada da configuracao Asaas"
  ON public.asaas_config
  FOR SELECT
  TO authenticated
  USING (TRUE);

REVOKE INSERT, UPDATE, DELETE ON public.asaas_config FROM anon, authenticated;
GRANT SELECT ON public.asaas_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asaas_config TO service_role;

CREATE OR REPLACE FUNCTION public.asaas_set_secret(
  p_secret_name TEXT,
  p_secret_value TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id UUID;
BEGIN
  IF p_secret_name NOT IN ('asaas_sandbox_api_key', 'asaas_production_api_key', 'asaas_webhook_token') THEN
    RAISE EXCEPTION 'Nome de segredo não permitido.';
  END IF;

  IF NULLIF(BTRIM(p_secret_value), '') IS NULL THEN
    RAISE EXCEPTION 'O segredo não pode ficar vazio.';
  END IF;

  SELECT id INTO v_secret_id
  FROM vault.secrets
  WHERE name = p_secret_name
  LIMIT 1;

  IF v_secret_id IS NULL THEN
    PERFORM vault.create_secret(
      p_secret_value,
      p_secret_name,
      'Segredo gerenciado pela integração Asaas'
    );
  ELSE
    PERFORM vault.update_secret(
      v_secret_id,
      p_secret_value,
      p_secret_name,
      'Segredo gerenciado pela integração Asaas'
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.asaas_get_secret(p_secret_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  IF p_secret_name NOT IN ('asaas_sandbox_api_key', 'asaas_production_api_key', 'asaas_webhook_token') THEN
    RAISE EXCEPTION 'Nome de segredo não permitido.';
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = p_secret_name
  LIMIT 1;

  RETURN v_secret;
END;
$$;

REVOKE ALL ON FUNCTION public.asaas_set_secret(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.asaas_get_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asaas_set_secret(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.asaas_get_secret(TEXT) TO service_role;

DO $$
BEGIN
  IF public.asaas_get_secret('asaas_webhook_token') IS NULL THEN
    PERFORM public.asaas_set_secret(
      'asaas_webhook_token',
      encode(extensions.gen_random_bytes(32), 'hex')
    );
  END IF;
END;
$$;

ALTER TABLE public.parceiros
  ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS parceiros_asaas_customer_uidx
  ON public.parceiros (asaas_customer_id)
  WHERE asaas_customer_id IS NOT NULL;

ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS asaas_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS asaas_invoice_url TEXT,
  ADD COLUMN IF NOT EXISTS asaas_status TEXT,
  ADD COLUMN IF NOT EXISTS asaas_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS asaas_last_error TEXT,
  ADD COLUMN IF NOT EXISTS origem_pagamento TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS contas_receber_asaas_payment_uidx
  ON public.contas_receber (asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS contas_receber_asaas_pending_idx
  ON public.contas_receber (status, asaas_payment_id)
  WHERE status IN ('PENDENTE', 'VENCIDO');

ALTER TABLE public.cursos
  ADD COLUMN IF NOT EXISTS asaas_payment_link_id TEXT,
  ADD COLUMN IF NOT EXISTS asaas_payment_link_url TEXT,
  ADD COLUMN IF NOT EXISTS asaas_link_status TEXT,
  ADD COLUMN IF NOT EXISTS asaas_link_updated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS cursos_asaas_payment_link_uidx
  ON public.cursos (asaas_payment_link_id)
  WHERE asaas_payment_link_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.inscricoes_online (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id UUID NOT NULL REFERENCES public.cursos(id) ON DELETE RESTRICT,
  turma_id UUID REFERENCES public.turmas(id) ON DELETE SET NULL,
  aluno_id UUID REFERENCES public.parceiros(id) ON DELETE SET NULL,
  matricula_id UUID REFERENCES public.matriculas(id) ON DELETE SET NULL,
  asaas_payment_id TEXT UNIQUE,
  asaas_customer_id TEXT,
  asaas_payment_link_id TEXT,
  nome TEXT,
  cpf_cnpj TEXT,
  email TEXT,
  telefone TEXT,
  valor NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO'
    CHECK (status IN ('AGUARDANDO_PAGAMENTO', 'PAGO', 'CANCELADO', 'ERRO')),
  erro TEXT,
  pago_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inscricoes_online_curso_status_idx
  ON public.inscricoes_online (curso_id, status, created_at DESC);

ALTER TABLE public.inscricoes_online ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inscricoes_online FROM anon;
GRANT SELECT ON public.inscricoes_online TO authenticated;

DROP POLICY IF EXISTS "Consulta autenticada de inscricoes online" ON public.inscricoes_online;
CREATE POLICY "Consulta autenticada de inscricoes online"
  ON public.inscricoes_online
  FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE TABLE IF NOT EXISTS public.asaas_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payment_id TEXT,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  processing_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

ALTER TABLE public.asaas_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.asaas_webhook_events FROM anon, authenticated;

COMMENT ON COLUMN public.contas_receber.asaas_payment_id IS
  'Identificador da cobrança no Asaas. Não contém segredo.';
COMMENT ON COLUMN public.cursos.asaas_payment_link_url IS
  'Link público de checkout do Asaas para cursos online.';

-- A cobrança automática de matrícula/parcelas pertence ao fluxo dos cursos técnicos.
-- Cursos online já chegam pagos pelo link e não devem ganhar uma segunda cobrança local.
CREATE OR REPLACE FUNCTION public.criar_financeiro_ao_matricular()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_modalidade TEXT;
BEGIN
  SELECT c.modalidade INTO v_modalidade
  FROM public.turmas t
  JOIN public.cursos c ON c.id = t.curso_id
  WHERE t.id = NEW.turma_id;

  IF NEW.status = 'ATIVO' AND v_modalidade = 'TECNICO' THEN
    PERFORM public.gerar_cobranca_matricula(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
