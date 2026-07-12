-- Server-side WhatsApp usage and billing summary.

CREATE TABLE IF NOT EXISTS public.whatsapp_billing_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  monthly_limit NUMERIC(12,2) NOT NULL DEFAULT 120.00,
  currency TEXT NOT NULL DEFAULT 'BRL',
  marketing_rate NUMERIC(12,4) NOT NULL DEFAULT 0.6200,
  billing_rate NUMERIC(12,4) NOT NULL DEFAULT 0.3200,
  service_rate NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
  meta_balance NUMERIC(12,2),
  meta_balance_source TEXT NOT NULL DEFAULT 'manual',
  meta_synced_at TIMESTAMPTZ,
  meta_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_billing_settings_singleton CHECK (id = true)
);

INSERT INTO public.whatsapp_billing_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.whatsapp_message_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.whatsapp_mensagens(id) ON DELETE CASCADE,
  conversa_id UUID NOT NULL REFERENCES public.whatsapp_conversas(id) ON DELETE CASCADE,
  aluno_id UUID REFERENCES public.parceiros(id) ON DELETE SET NULL,
  usage_month DATE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('marketing', 'billing', 'service')),
  unit_price NUMERIC(12,4) NOT NULL DEFAULT 0,
  cost NUMERIC(12,4) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'BRL',
  source TEXT NOT NULL DEFAULT 'server_rule',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id)
);

CREATE TABLE IF NOT EXISTS public.whatsapp_meta_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'erro')),
  requested_by UUID REFERENCES public.usuarios_sistema(id) ON DELETE SET NULL,
  waba_id TEXT,
  phone_number_id TEXT,
  currency TEXT,
  meta_balance NUMERIC(12,2),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_usage_month
  ON public.whatsapp_message_usage (usage_month DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_usage_conversa
  ON public.whatsapp_message_usage (conversa_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_meta_sync_logs_created
  ON public.whatsapp_meta_sync_logs (created_at DESC);

ALTER TABLE public.whatsapp_billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_message_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_meta_sync_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_whatsapp_billing_settings_gestor_read" ON public.whatsapp_billing_settings;
CREATE POLICY "portal_whatsapp_billing_settings_gestor_read"
  ON public.whatsapp_billing_settings FOR SELECT TO authenticated
  USING (public.is_gestor());

DROP POLICY IF EXISTS "portal_whatsapp_message_usage_gestor_read" ON public.whatsapp_message_usage;
CREATE POLICY "portal_whatsapp_message_usage_gestor_read"
  ON public.whatsapp_message_usage FOR SELECT TO authenticated
  USING (public.is_gestor());

DROP POLICY IF EXISTS "portal_whatsapp_meta_sync_logs_gestor_read" ON public.whatsapp_meta_sync_logs;
CREATE POLICY "portal_whatsapp_meta_sync_logs_gestor_read"
  ON public.whatsapp_meta_sync_logs FOR SELECT TO authenticated
  USING (public.is_gestor());

GRANT SELECT ON public.whatsapp_billing_settings TO authenticated;
GRANT SELECT ON public.whatsapp_message_usage TO authenticated;
GRANT SELECT ON public.whatsapp_meta_sync_logs TO authenticated;
GRANT ALL ON public.whatsapp_billing_settings TO service_role;
GRANT ALL ON public.whatsapp_message_usage TO service_role;
GRANT ALL ON public.whatsapp_meta_sync_logs TO service_role;

CREATE OR REPLACE FUNCTION public.whatsapp_normalize_text(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(
    translate(
      coalesce(p_text, ''),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_has_financial_terms(p_text TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.whatsapp_normalize_text(p_text) ~
    '(atras|boleto|cobranc|cobranca|fatura|pagamento|parcela|pix|regulariz|recebemos seu pagamento|venc)';
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_is_service_window(p_message_id UUID, p_conversa_id UUID, p_created_at TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.whatsapp_mensagens wm
    WHERE wm.conversa_id = p_conversa_id
      AND wm.id <> p_message_id
      AND wm.direcao = 'entrada'
      AND wm.created_at <= p_created_at
      AND wm.created_at >= p_created_at - interval '24 hours'
  );
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_classify_usage(
  p_message_id UUID,
  p_conversa_id UUID,
  p_created_at TIMESTAMPTZ,
  p_content TEXT
)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN public.whatsapp_is_service_window(p_message_id, p_conversa_id, p_created_at) THEN 'service'
    WHEN public.whatsapp_has_financial_terms(p_content) THEN 'billing'
    ELSE 'marketing'
  END;
$$;

CREATE OR REPLACE FUNCTION public.whatsapp_record_message_usage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.whatsapp_billing_settings%ROWTYPE;
  v_category TEXT;
  v_unit_price NUMERIC(12,4);
BEGIN
  IF NEW.direcao <> 'saida' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_settings
  FROM public.whatsapp_billing_settings
  WHERE id = true;

  IF NOT FOUND THEN
    INSERT INTO public.whatsapp_billing_settings (id)
    VALUES (true)
    RETURNING * INTO v_settings;
  END IF;

  v_category := public.whatsapp_classify_usage(NEW.id, NEW.conversa_id, NEW.created_at, NEW.conteudo);
  v_unit_price := CASE v_category
    WHEN 'marketing' THEN v_settings.marketing_rate
    WHEN 'billing' THEN v_settings.billing_rate
    ELSE v_settings.service_rate
  END;

  INSERT INTO public.whatsapp_message_usage (
    message_id,
    conversa_id,
    aluno_id,
    usage_month,
    category,
    unit_price,
    cost,
    currency
  )
  VALUES (
    NEW.id,
    NEW.conversa_id,
    NEW.aluno_id,
    date_trunc('month', NEW.created_at)::date,
    v_category,
    coalesce(v_unit_price, 0),
    coalesce(v_unit_price, 0),
    coalesce(v_settings.currency, 'BRL')
  )
  ON CONFLICT (message_id) DO UPDATE
    SET category = EXCLUDED.category,
        unit_price = EXCLUDED.unit_price,
        cost = EXCLUDED.cost,
        currency = EXCLUDED.currency;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_whatsapp_record_message_usage ON public.whatsapp_mensagens;
CREATE TRIGGER trg_whatsapp_record_message_usage
  AFTER INSERT OR UPDATE OF direcao, conteudo, created_at, conversa_id
  ON public.whatsapp_mensagens
  FOR EACH ROW
  EXECUTE FUNCTION public.whatsapp_record_message_usage();

INSERT INTO public.whatsapp_message_usage (
  message_id,
  conversa_id,
  aluno_id,
  usage_month,
  category,
  unit_price,
  cost,
  currency
)
SELECT
  wm.id,
  wm.conversa_id,
  wm.aluno_id,
  date_trunc('month', wm.created_at)::date,
  public.whatsapp_classify_usage(wm.id, wm.conversa_id, wm.created_at, wm.conteudo),
  CASE public.whatsapp_classify_usage(wm.id, wm.conversa_id, wm.created_at, wm.conteudo)
    WHEN 'marketing' THEN wbs.marketing_rate
    WHEN 'billing' THEN wbs.billing_rate
    ELSE wbs.service_rate
  END,
  CASE public.whatsapp_classify_usage(wm.id, wm.conversa_id, wm.created_at, wm.conteudo)
    WHEN 'marketing' THEN wbs.marketing_rate
    WHEN 'billing' THEN wbs.billing_rate
    ELSE wbs.service_rate
  END,
  wbs.currency
FROM public.whatsapp_mensagens wm
CROSS JOIN public.whatsapp_billing_settings wbs
WHERE wm.direcao = 'saida'
ON CONFLICT (message_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.whatsapp_usage_summary(p_month DATE DEFAULT date_trunc('month', now())::date)
RETURNS TABLE (
  usage_month DATE,
  monthly_limit NUMERIC,
  currency TEXT,
  meta_balance NUMERIC,
  meta_balance_source TEXT,
  meta_synced_at TIMESTAMPTZ,
  marketing_sent BIGINT,
  marketing_rate NUMERIC,
  marketing_cost NUMERIC,
  marketing_available BIGINT,
  marketing_percent NUMERIC,
  billing_sent BIGINT,
  billing_rate NUMERIC,
  billing_cost NUMERIC,
  billing_available BIGINT,
  billing_percent NUMERIC,
  service_sent BIGINT,
  service_rate NUMERIC,
  service_cost NUMERIC,
  service_percent NUMERIC,
  total_sent BIGINT,
  spent NUMERIC,
  remaining NUMERIC,
  spent_percent NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH settings AS (
    SELECT *
    FROM public.whatsapp_billing_settings
    WHERE id = true
  ),
  usage AS (
    SELECT
      coalesce(sum(cost) FILTER (WHERE category = 'marketing'), 0) AS marketing_cost,
      coalesce(count(*) FILTER (WHERE category = 'marketing'), 0) AS marketing_sent,
      coalesce(sum(cost) FILTER (WHERE category = 'billing'), 0) AS billing_cost,
      coalesce(count(*) FILTER (WHERE category = 'billing'), 0) AS billing_sent,
      coalesce(sum(cost) FILTER (WHERE category = 'service'), 0) AS service_cost,
      coalesce(count(*) FILTER (WHERE category = 'service'), 0) AS service_sent,
      coalesce(sum(cost), 0) AS spent,
      coalesce(count(*), 0) AS total_sent
    FROM public.whatsapp_message_usage
    WHERE usage_month = date_trunc('month', p_month)::date
  )
  SELECT
    date_trunc('month', p_month)::date AS usage_month,
    s.monthly_limit,
    s.currency,
    s.meta_balance,
    s.meta_balance_source,
    s.meta_synced_at,
    u.marketing_sent,
    s.marketing_rate,
    u.marketing_cost,
    floor(greatest(s.monthly_limit - u.spent, 0) / nullif(s.marketing_rate, 0))::bigint,
    CASE WHEN s.monthly_limit > 0 THEN round(least((u.marketing_cost / s.monthly_limit) * 100, 100), 2) ELSE 0 END,
    u.billing_sent,
    s.billing_rate,
    u.billing_cost,
    floor(greatest(s.monthly_limit - u.spent, 0) / nullif(s.billing_rate, 0))::bigint,
    CASE WHEN s.monthly_limit > 0 THEN round(least((u.billing_cost / s.monthly_limit) * 100, 100), 2) ELSE 0 END,
    u.service_sent,
    s.service_rate,
    u.service_cost,
    CASE WHEN s.monthly_limit > 0 THEN round(least((u.service_cost / s.monthly_limit) * 100, 100), 2) ELSE 0 END,
    u.total_sent,
    u.spent,
    greatest(s.monthly_limit - u.spent, 0),
    CASE WHEN s.monthly_limit > 0 THEN round(least((u.spent / s.monthly_limit) * 100, 100), 2) ELSE 0 END
  FROM settings s
  CROSS JOIN usage u;
$$;

GRANT EXECUTE ON FUNCTION public.whatsapp_usage_summary(DATE) TO authenticated, service_role;
