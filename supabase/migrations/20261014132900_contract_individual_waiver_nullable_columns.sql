begin;

-- Contract-only interpretation of historical proof after nullable schema additions.
-- Does not change financial eligibility, cash, receivables or bank operations.
-- Non-null changes, exact run identity and all payment/bank guards still apply.
CREATE FUNCTION internal_academic.contract_local_waiver_complete(r public.contas_receber)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select internal_financial_correction.reversed_control_waiver_complete(r) or exists(select 1 from internal_financial_correction.items i
 join internal_financial_correction.operations o on o.id=i.operation_id
 join internal_academic.technical_manual_cycle_runs run on run.matricula_id=i.matricula_id and run.cycle_number=1
 where i.receivable_id=r.id and i.kind='LOCAL_WAIVER' and i.state='FINALIZED' and i.finalized_at is not null
 and o.state='FINALIZED' and r.status='CANCELADO' and to_jsonb(run)=i.run_snapshot
 and r.id=any(run.receivable_ids) and r.tipo_lancamento='MATRICULA' and r.parcela_numero=0
 and r.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL'
 and internal_academic.manual_cycle_has_local_intent(r)
 and jsonb_strip_nulls(to_jsonb(r)-array['status','updated_at'])=jsonb_strip_nulls(i.receivable_snapshot-array['status','updated_at'])
 and not internal_financial_correction.has_payment_evidence(r)
 and not exists(select 1 from public.payment_gateway_transactions t where t.receivable_id=r.id));
$function$;

revoke all on function internal_academic.contract_local_waiver_complete(public.contas_receber)
  from public, anon, authenticated, service_role;
commit;

