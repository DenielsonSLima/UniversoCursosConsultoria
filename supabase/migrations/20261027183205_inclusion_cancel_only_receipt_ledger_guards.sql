-- REVIEW DRAFT ONLY. Close concurrent receipt-attempt admission and inspect newer ledger.
begin;
alter function internal_inclusion_cancellation.source(uuid,boolean)
 rename to source_before_receipt_ledger_guards;
create function internal_inclusion_cancellation.source(p_receivable_id uuid,p_completed boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare title jsonb; identity_value jsonb;
begin
 -- Original source first locks receipt/transaction/queue and verifies identity.
 title:=internal_inclusion_cancellation.source_before_receipt_ledger_guards(p_receivable_id,p_completed);
 identity_value:=title->'identity';
 if exists(select 1 from public.financial_payment_events
   where source_kind='RECEIVABLE' and source_id=p_receivable_id)
  or exists(select 1 from internal_receivable_payments.attempts
   where receivable_id=p_receivable_id and state not in('COMPLETE','FAILED_SAFE'))
 then raise exception 'INCLUSION_PAYMENT_LEDGER_OR_ACTIVE_ATTEMPT'; end if;
 if exists(select 1 from internal_academic.technical_manual_banese_reissue_archive a
   where a.environment=identity_value->>'environment' and a.convenio=identity_value->>'convenio'
    and a.canceled_nosso_numero=identity_value->>'nossoNumero')
  or exists(select 1 from public.banese_ead_title_replacement_archive a
   where a.environment=identity_value->>'environment' and a.convenio=identity_value->>'convenio'
    and a.canceled_nosso_numero=identity_value->>'nossoNumero')
  or exists(select 1 from internal_financial_correction.normal_cycle_reset_archive a
   where a.bank_environment=identity_value->>'environment' and a.bank_convenio=identity_value->>'convenio'
    and a.canceled_nosso_numero=identity_value->>'nossoNumero')
 then raise exception 'INCLUSION_CANCELED_NUMBER_HISTORY_REQUIRES_REVIEW'; end if;
 return title;
end $$;
-- Same target receipt lock as claim/start/complete. An attempt cannot begin after
-- approval, nor can a previously failed attempt be reactivated around the fence.
-- Real external payment evidence is still recorded and causes review, not erased.
create trigger a01_inclusion_receipt_attempt_fence
 before insert or update on internal_receivable_payments.attempts
 for each row execute function internal_inclusion_cancellation.fence_new_operation();
revoke all on function internal_inclusion_cancellation.source(uuid,boolean)
 from public,anon,authenticated,service_role;
revoke all on function internal_inclusion_cancellation.source_before_receipt_ledger_guards(uuid,boolean)
 from public,anon,authenticated,service_role;
commit;
