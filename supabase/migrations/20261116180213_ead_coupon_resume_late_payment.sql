begin;
-- A late receipt must never erase either the real payment or the coupon audit.
-- Route it to the existing financial-review workflow instead of auto-refunding.
create or replace function internal_contas.ead_coupon_resumed_late_payment()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_r public.ead_coupon_redemptions%rowtype;
begin
  if new.status is distinct from 'PAGO' or coalesce(new.valor_pago,0)<=0
    or new.data_pagamento is null or new.ead_checkout_attempt_id is null then return new; end if;
  select * into v_r from public.ead_coupon_redemptions r
    where r.matricula_id=new.matricula_id and r.aluno_id=new.cliente_id
      and r.status='CONFIRMED' and r.discount_percent=100
      and (r.request_payload->'resumedHistory'->'attemptIds') ? new.ead_checkout_attempt_id::text;
  if v_r.id is null then return new; end if;
  insert into public.ead_payment_reviews(attempt_id,receivable_id,polo_id,reason,evidence)
    values(new.ead_checkout_attempt_id,new.id,new.polo_id,'PAYMENT_EVIDENCE_MISMATCH',
      jsonb_build_object('code','PAYMENT_AFTER_COUPON_FREE_RESUMPTION','redemptionId',v_r.id,
        'couponId',v_r.coupon_id,'confirmedAt',v_r.confirmed_at))
    on conflict(attempt_id,reason) do nothing;
  return new;
end; $$;
revoke all on function internal_contas.ead_coupon_resumed_late_payment() from public,anon,authenticated,service_role;
create trigger ead_coupon_resumed_late_payment after update of status,valor_pago,data_pagamento
  on public.contas_receber for each row execute function internal_contas.ead_coupon_resumed_late_payment();
commit;
