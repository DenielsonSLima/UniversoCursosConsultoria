-- Inclui Outros Créditos no roteamento bancário modular.
-- A cobrança avulsa do financeiro também precisa escolher provedor por ambiente
-- e forma de pagamento, igual às modalidades de curso.

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname
    INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'payment_gateway_routes'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%modalidade%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.payment_gateway_routes DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.payment_gateway_routes
  ADD CONSTRAINT payment_gateway_routes_modalidade_check
  CHECK (modalidade IN ('EAD', 'TECNICO', 'LIVRE', 'ESPECIALIZACAO', 'OUTROS_CREDITOS'));

WITH combos(modalidade, payment_method) AS (
  VALUES
    ('OUTROS_CREDITOS', 'PIX'),
    ('OUTROS_CREDITOS', 'BOLETO'),
    ('OUTROS_CREDITOS', 'CREDIT_CARD')
),
envs(environment) AS (
  VALUES ('sandbox'), ('production')
)
INSERT INTO public.payment_gateway_routes (
  modalidade,
  payment_method,
  environment,
  provider_code,
  credential_id,
  enabled
)
SELECT
  combos.modalidade,
  combos.payment_method,
  envs.environment,
  'asaas',
  credentials.id,
  TRUE
FROM combos
CROSS JOIN envs
LEFT JOIN public.payment_gateway_credentials credentials
  ON credentials.provider_code = 'asaas'
 AND credentials.environment = envs.environment
ON CONFLICT (modalidade, payment_method, environment) DO NOTHING;
