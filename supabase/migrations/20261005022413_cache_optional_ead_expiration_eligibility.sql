begin;

-- Preserve both cancellation contracts. Avoid planning the strict legacy
-- checkout query for ordinary receivables during the enabled worker scan.
-- These early guards are shared by both original branches; academic history,
-- bank evidence and the canonical paid sibling remain in their full predicates.
create or replace function internal_contas.ead_expiration_eligible(p_receivable_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_c record;
begin
  select c.id,c.status,c.tipo_lancamento,c.origem_pagamento,c.ead_checkout_attempt_id,
    c.data_pagamento,c.valor_pago,c.manual_settlement_id
  into v_c from public.contas_receber c where c.id=p_receivable_id;
  if not found then return false; end if;
  if (v_c.status in ('PENDENTE','VENCIDO','SUSPENSO',
      'AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO')
    and v_c.data_pagamento is null and coalesce(v_c.valor_pago,0)=0
    and v_c.manual_settlement_id is null) is not true
  then return false; end if;

  if v_c.ead_checkout_attempt_id is not null and exists (
    select 1 from public.ead_checkout_attempts a
    join public.contas_receber c on c.id=a.receivable_id
    join public.inscricoes_online i on i.id=a.inscription_id
    join public.payment_gateway_transactions t on t.id=a.transaction_id
    where c.id=p_receivable_id and a.state='PAYMENT_RECOVERY_FENCED'
      and a.nature='COMPRA_OPCIONAL' and c.ead_checkout_attempt_id=a.id
      and c.status in ('PENDENTE','VENCIDO','AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO')
      and c.data_pagamento is null and coalesce(c.valor_pago,0)=0 and c.manual_settlement_id is null
      and i.status='AGUARDANDO_PAGAMENTO' and i.pago_em is null and i.confirmado_em is null
      and upper(coalesce(t.remote_status,'')) in ('PENDING','REGISTERED','EXPIRED')
      and exists(select 1 from public.ead_checkout_attempts paid
        join public.contas_receber received on received.id=paid.receivable_id
        where paid.matricula_id=a.matricula_id and paid.curso_id=a.curso_id and paid.id<>a.id
          and paid.state in ('PAID','PAID_REVIEW') and received.status='PAGO'
          and received.gateway_status='PAID' and received.origem_pagamento='BANESE'
          and received.gateway_settlement_source='API' and received.valor_pago>0
          and received.data_pagamento is not null)
  ) then return true; end if;

  if (v_c.tipo_lancamento='MATRICULA'
    and v_c.origem_pagamento in ('GATEWAY_EAD','GATEWAY_ONLINE')) is not true
  then return false; end if;
  return internal_contas.ead_checkout_can_expire(p_receivable_id);
end;
$$;
revoke all on function internal_contas.ead_expiration_eligible(uuid)
  from public,anon,authenticated,service_role;

commit;
