begin;

create or replace function
internal_academic.technical_manual_banese_has_settlement_evidence(
  p_receivable public.contas_receber
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $function$
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
$function$;

revoke all on function
  internal_academic.technical_manual_banese_has_settlement_evidence(
    public.contas_receber
  ) from public, anon, authenticated, service_role;

comment on function
  internal_academic.technical_manual_banese_has_settlement_evidence(
    public.contas_receber
  ) is 'Detecta qualquer evidência de liquidação que bloqueia mutações da emissão manual BolePix.';

commit;
