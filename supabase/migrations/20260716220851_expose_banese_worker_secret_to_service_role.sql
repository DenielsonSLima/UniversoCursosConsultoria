-- Leitura dedicada do segredo do worker, sem ampliar a allowlist generica dos
-- segredos bancarios.

CREATE OR REPLACE FUNCTION public.get_banese_reconciliation_worker_secret()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = 'payment_gateway_banese_card_reconciliation_worker_secret'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_banese_reconciliation_worker_secret()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_banese_reconciliation_worker_secret()
  TO service_role;

COMMENT ON FUNCTION public.get_banese_reconciliation_worker_secret() IS
  'Retorna somente ao service_role o segredo interno do worker Banese.';
