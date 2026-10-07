CREATE OR REPLACE FUNCTION internal_academic.technical_manual_banese_has_settlement_evidence(p_receivable contas_receber)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select p_receivable.data_pagamento is not null
    or p_receivable.valor_pago is not null
    or p_receivable.manual_settlement_id is not null
    or p_receivable.manual_settlement_principal_cents is not null
    or p_receivable.manual_settlement_interest_cents is not null
    or p_receivable.manual_settlement_penalty_cents is not null
    or p_receivable.manual_settlement_addition_cents is not null
    or p_receivable.manual_settlement_discount_cents is not null
    or p_receivable.manual_settlement_received_cents is not null
    or p_receivable.manual_settlement_reversed_at is not null
    or p_receivable.gateway_settlement_channel is not null
    or p_receivable.gateway_settlement_source is not null
    or p_receivable.gateway_settlement_evidence is not null
    or p_receivable.gateway_settlement_recorded_at is not null
    or p_receivable.gateway_transaction_receipt_url is not null;
$function$
;
