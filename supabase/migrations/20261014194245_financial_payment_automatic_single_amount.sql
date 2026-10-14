BEGIN;

-- Suggest the complete adjusted payment on the server for a single method.
-- Confirmation still receives the explicit canonical amount and fingerprint.
CREATE OR REPLACE FUNCTION public.preview_financial_payment_secure(
  p_source_kind text, p_source_id uuid, p_input jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  actor uuid := auth.uid();
  source jsonb;
  summary jsonb;
  adjusted jsonb := p_input - 'automaticAmount';
  remaining bigint;
  discount bigint;
  amount bigint;
BEGIN
  IF p_input->'automaticAmount' = 'true'::jsonb THEN
    source := internal_financial_payments.authorize_source(actor,p_source_kind,p_source_id);
    IF jsonb_typeof(p_input->'components') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'PAYMENT_INVALID_INPUT';
    END IF;
    IF jsonb_array_length(p_input->'components') <> 1 THEN
      RAISE EXCEPTION 'PAYMENT_INVALID_INPUT';
    END IF;
    summary := internal_financial_payments.summary(p_source_kind,p_source_id,source);
    remaining := internal_financial_payments.cents(summary->'remainingBefore');
    discount := internal_financial_payments.cents(p_input->'discount');
    IF discount > remaining THEN
      RAISE EXCEPTION 'PAYMENT_EXCEEDS_REMAINING';
    END IF;
    amount := remaining
      + internal_financial_payments.cents(p_input->'interest')
      + internal_financial_payments.cents(p_input->'penalty')
      + internal_financial_payments.cents(p_input->'addition') - discount;
    IF amount <= 0 THEN
      RAISE EXCEPTION 'PAYMENT_INVALID_AMOUNT';
    END IF;
    adjusted := jsonb_set(adjusted,'{components,0,amount}',
      to_jsonb(internal_financial_payments.money(amount)),false);
  END IF;
  RETURN internal_financial_payments.preview_for_actor(actor,p_source_kind,p_source_id,adjusted);
END $$;

REVOKE ALL ON FUNCTION public.preview_financial_payment_secure(text,uuid,jsonb)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.preview_financial_payment_secure(text,uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
