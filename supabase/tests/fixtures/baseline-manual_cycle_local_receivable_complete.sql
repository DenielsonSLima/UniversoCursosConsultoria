CREATE OR REPLACE FUNCTION internal_academic.manual_cycle_local_receivable_complete(p_receivable contas_receber)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not internal_academic.manual_cycle_has_local_intent(p_receivable)
    or internal_academic.manual_cycle_has_bank_fields(p_receivable)
    or exists(select 1 from public.payment_gateway_transactions t where t.receivable_id=p_receivable.id)
  then return false; end if;
  perform internal_academic.assert_manual_cycle_reviewed_receivable(p_receivable);
  if p_receivable.status in ('PENDENTE','VENCIDO') then
    if p_receivable.manual_settlement_id is not null or p_receivable.manual_settlement_reversed_at is not null then
      return coalesce(internal_academic.manual_cycle_local_reversed_receivable_complete(p_receivable),false);
    end if;
    return p_receivable.data_pagamento is null and p_receivable.valor_pago is null;
  end if;
  if p_receivable.status<>'PAGO' or p_receivable.origem_pagamento is distinct from 'PRESENCIAL'
    or p_receivable.manual_settlement_reversed_at is not null then return false; end if;
  return exists(select 1 from public.receivable_manual_settlements s
    where s.id=p_receivable.manual_settlement_id and s.receivable_id=p_receivable.id
      and s.state='COMPLETED' and not s.requires_remote_cancellation
      and s.provider_code is null and s.remote_payment_id is null and s.remote_payment_link_id is null
      and s.polo_id is not distinct from p_receivable.polo_id
      and s.account_id is not distinct from p_receivable.conta_bancaria_id
      and s.payment_method is not distinct from p_receivable.forma_pagamento
      and s.payment_date=p_receivable.data_pagamento
      and s.principal_cents=round(p_receivable.valor*100)::bigint
      and s.received_cents=round(p_receivable.valor_pago*100)::bigint
      and s.principal_cents=p_receivable.manual_settlement_principal_cents
      and s.interest_cents=p_receivable.manual_settlement_interest_cents
      and s.penalty_cents=p_receivable.manual_settlement_penalty_cents
      and s.addition_cents=p_receivable.manual_settlement_addition_cents
      and s.discount_cents=p_receivable.manual_settlement_discount_cents
      and s.received_cents=p_receivable.manual_settlement_received_cents);
exception when others then return false;
end;
$function$

