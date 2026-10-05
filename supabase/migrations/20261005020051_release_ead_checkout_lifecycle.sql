begin;

-- Code readiness is separate from operator/calendar activation. This migration
-- follows deployment of every receipt-identity/CAS inscription writer.
do $ready$
begin
  if to_regclass('public.contas_receber_matricula_matricula_uidx') is not null
    or exists(select 1 from pg_constraint where conrelid='public.inscricoes_online'::regclass
      and conname='inscricoes_online_matricula_id_key')
    or to_regclass('public.contas_receber_legacy_matricula_uidx') is null
    or to_regclass('public.inscricoes_online_legacy_matricula_uidx') is null
    or to_regprocedure('public.ead_prepare_checkout_attempt(uuid,uuid,uuid,text,text,text,numeric,date,text,numeric,numeric)') is null
    or to_regprocedure('public.ead_bind_checkout_attempt(uuid,uuid,uuid,uuid)') is null
    or to_regprocedure('public.ead_validate_checkout_attempt_for_issuance(uuid,uuid,uuid)') is null
    or to_regprocedure('public.recover_banese_ead_checkout_payment(uuid,uuid,jsonb)') is null
    or to_regprocedure('public.ead_get_student_checkout_states(uuid)') is null
    or to_regprocedure('public.ead_list_payment_reviews_secure(uuid)') is null
    or to_regprocedure('public.ead_resolve_payment_review_secure(uuid,uuid,text,uuid,text,text)') is null
    or to_regprocedure('internal_contas.ead_verified_settlement_cents(jsonb,date)') is null then
    raise exception 'EAD purchase lifecycle prerequisites incomplete.';
  end if;
end;
$ready$;
create or replace function internal_contas.ead_expiration_release_ready()
returns boolean language sql immutable set search_path='' as $ready$
  select true;
$ready$;
revoke all on function internal_contas.ead_expiration_release_ready()
  from public,anon,authenticated,service_role;
comment on function internal_contas.ead_expiration_release_ready() is
  'Repurchase, late-payment recovery and scoped confirmed-refund reviews validated. Bank cancellation still requires enabled environment and verified local calendar/polo.';

commit;
