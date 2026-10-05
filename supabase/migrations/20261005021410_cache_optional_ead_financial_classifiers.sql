begin;

-- SQL wrappers planned the complex legacy query for every receivable, including
-- ordinary obligations. Reuse PL/pgSQL cached statements and reject only states
-- that the immutable legacy predicates already reject. Keep the public helper
-- OIDs, durable purchase nature and every legacy payment/academic witness.
create or replace function internal_contas.ead_checkout_is_optional(p_receivable_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_c record;
begin
  select c.id,c.status,c.tipo_lancamento,c.origem_pagamento,c.ead_checkout_attempt_id
  into v_c from public.contas_receber c where c.id=p_receivable_id;
  if not found or v_c.status is null or v_c.status='PAGO' then return false; end if;

  if v_c.ead_checkout_attempt_id is not null and exists (
    select 1 from public.ead_checkout_attempts a
    where a.id=v_c.ead_checkout_attempt_id and a.receivable_id=v_c.id
      and a.nature='COMPRA_OPCIONAL'
  ) then return true; end if;

  if (v_c.status in ('PENDENTE','VENCIDO','SUSPENSO',
      'AGUARDANDO_PAGAMENTO','AGUARDANDO_CONFIRMACAO')
    and v_c.tipo_lancamento='MATRICULA'
    and v_c.origem_pagamento in ('GATEWAY_EAD','GATEWAY_ONLINE','BANESE')) is not true
  then return false; end if;
  return internal_contas.ead_checkout_is_optional_legacy_20261004(p_receivable_id);
end;
$$;

create or replace function internal_contas.ead_checkout_paid_after_cutoff(
  p_receivable_id uuid,p_payment_cutoff_exclusive date
)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_c record;
begin
  select c.id,c.status,c.tipo_lancamento,c.origem_pagamento,c.ead_checkout_attempt_id,
    c.valor_pago,c.data_pagamento
  into v_c from public.contas_receber c where c.id=p_receivable_id;
  if not found then return false; end if;
  if (v_c.status='PAGO' and v_c.valor_pago>0
    and v_c.data_pagamento>=p_payment_cutoff_exclusive) is not true
  then return false; end if;

  if v_c.ead_checkout_attempt_id is not null and exists (
    select 1 from public.ead_checkout_attempts a
    where a.id=v_c.ead_checkout_attempt_id and a.receivable_id=v_c.id
      and a.nature='COMPRA_OPCIONAL'
  ) then return true; end if;

  if (v_c.tipo_lancamento='MATRICULA'
    and v_c.origem_pagamento in ('GATEWAY_EAD','GATEWAY_ONLINE','BANESE')) is not true
  then return false; end if;
  return internal_contas.ead_checkout_paid_after_cutoff_legacy_20261004(
    p_receivable_id,p_payment_cutoff_exclusive);
end;
$$;
revoke all on function internal_contas.ead_checkout_is_optional(uuid),
  internal_contas.ead_checkout_paid_after_cutoff(uuid,date)
  from public,anon,authenticated,service_role;

commit;
