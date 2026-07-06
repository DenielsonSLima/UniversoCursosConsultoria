UPDATE public.payment_gateway_transactions tx
SET installments = COALESCE(cr.gateway_installments, 1),
    updated_at = now()
FROM public.contas_receber cr
WHERE tx.receivable_id = cr.id
  AND tx.provider_code = 'mercado_pago'
  AND tx.installments IS NULL;

UPDATE public.payment_gateway_transactions
SET installments = 1,
    updated_at = now()
WHERE provider_code = 'mercado_pago'
  AND installments IS NULL;
