-- Politica explicita de negacao: a sequencia e operada somente pelas funcoes
-- SECURITY DEFINER concedidas a service_role.

DROP POLICY IF EXISTS banese_boleto_sequences_deny_clients
  ON public.banese_boleto_sequences;
CREATE POLICY banese_boleto_sequences_deny_clients
  ON public.banese_boleto_sequences
  FOR ALL
  TO anon, authenticated
  USING (FALSE)
  WITH CHECK (FALSE);
