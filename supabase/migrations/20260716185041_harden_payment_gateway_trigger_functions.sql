BEGIN;

-- Trigger functions are internal implementation details. PostgreSQL executes
-- them through their triggers; browser roles must never invoke them directly.
REVOKE ALL ON FUNCTION public.validate_payment_gateway_issuer_config()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fill_payment_gateway_receivable_issuer()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fill_payment_gateway_online_enrollment_issuer()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fill_payment_gateway_transaction_scope()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.validate_payment_gateway_issuer_config()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fill_payment_gateway_receivable_issuer()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fill_payment_gateway_online_enrollment_issuer()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fill_payment_gateway_transaction_scope()
  TO service_role;

COMMIT;
