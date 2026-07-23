BEGIN;

-- Asaas e Banco Inter deixam de participar de novas configuracoes. Os
-- registros e credenciais permanecem intactos para auditoria e eventual
-- encerramento de cobrancas historicas.
UPDATE public.payment_gateway_providers
SET
  active = false,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'new_charges_disabled', true,
    'disabled_reason',
    'Fora do escopo financeiro definido: Banese para boleto/Pix e Mercado Pago para cartao.'
  ),
  updated_at = now()
WHERE code IN ('asaas', 'banco_inter');

UPDATE public.payment_gateway_providers
SET
  active = true,
  supports_pix = true,
  supports_boleto = true,
  supports_credit_card = false,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'intended_role', 'boleto_pix',
    'pix_sandbox_blocked', true,
    'pix_production_requires_bank_release', true
  ),
  updated_at = now()
WHERE code = 'banese_card';

UPDATE public.payment_gateway_providers
SET
  active = true,
  supports_pix = false,
  supports_boleto = false,
  supports_credit_card = true,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'intended_role', 'credit_card',
    'production_requires_homologation', true
  ),
  updated_at = now()
WHERE code = 'mercado_pago';

-- A tabela possui uma rota unica por modalidade/metodo/ambiente. Convertemos
-- todas as rotas existentes para o escopo novo sem apagar seu historico.
UPDATE public.payment_gateway_routes AS route
SET
  provider_code = CASE
    WHEN route.payment_method = 'CREDIT_CARD' THEN 'mercado_pago'
    ELSE 'banese_card'
  END,
  credential_id = (
    SELECT credential.id
    FROM public.payment_gateway_credentials AS credential
    WHERE credential.provider_code = CASE
      WHEN route.payment_method = 'CREDIT_CARD' THEN 'mercado_pago'
      ELSE 'banese_card'
    END
      AND credential.environment = route.environment
    ORDER BY
      credential.updated_at DESC NULLS LAST,
      credential.created_at DESC NULLS LAST,
      credential.id DESC
    LIMIT 1
  ),
  enabled = route.environment = 'sandbox'
    AND route.payment_method = 'BOLETO',
  notes = CASE
    WHEN coalesce(route.notes, '') LIKE '%ESCOPO_BANESE_MP_20260722%'
      THEN route.notes
    ELSE concat_ws(
      ' | ',
      nullif(route.notes, ''),
      'ESCOPO_BANESE_MP_20260722: Banese boleto/Pix; Mercado Pago cartao. Rotas nao homologadas permanecem desativadas.'
    )
  END,
  updated_at = now();

ALTER TABLE public.payment_gateway_routes
  DROP CONSTRAINT IF EXISTS payment_gateway_routes_provider_method_scope_check;

ALTER TABLE public.payment_gateway_routes
  ADD CONSTRAINT payment_gateway_routes_provider_method_scope_check
  CHECK (
    (provider_code = 'banese_card' AND payment_method IN ('PIX', 'BOLETO'))
    OR
    (provider_code = 'mercado_pago' AND payment_method = 'CREDIT_CARD')
  );

COMMENT ON CONSTRAINT payment_gateway_routes_provider_method_scope_check
  ON public.payment_gateway_routes IS
  'Novas rotas: Banese somente boleto/Pix; Mercado Pago somente cartao.';

COMMIT;
