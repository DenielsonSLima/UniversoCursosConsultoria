-- PRIVATE all-or-nothing internal stage. Bank worker cannot call or grant this.
begin;
create function internal_financial_correction.finalize_operation(p_operation_id uuid,p_plan_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o internal_financial_correction.operations%rowtype;
 i internal_financial_correction.items%rowtype; r public.contas_receber%rowtype;
 t public.payment_gateway_transactions%rowtype; a internal_academic.technical_manual_receivable_issuance_authorizations%rowtype;
 j internal_academic.technical_manual_banese_reissue_jobs%rowtype;
 previous_context text:=current_setting('app.bounded_financial_correction_id',true);
 changed integer; n timestamptz; bank jsonb;
begin
 o:=internal_financial_correction.assert_operation(p_operation_id);
 if p_plan_fingerprint is distinct from o.plan_fingerprint then raise exception 'BOUNDED_FINALIZE_PLAN_CHANGED'; end if;
 if o.state='FINALIZED' then
   perform internal_financial_correction.assert_finalized_operation(o.id);
   return jsonb_build_object('finalized',true,'replayed',true);
 end if;
 if o.state<>'BANK_CONFIRMED' or (select count(*) from internal_financial_correction.items
   where operation_id=o.id and kind<>'LOCAL_WAIVER' and state='BANK_CONFIRMED')<>49
 then raise exception 'BOUNDED_ALL_49_BANK_CONFIRMATIONS_REQUIRED'; end if;
 -- Deterministic scope locks before validation or any internal mutation.
 perform 1 from internal_academic.technical_manual_cycle_runs run where exists(
   select 1 from internal_financial_correction.items x where x.operation_id=o.id
   and x.matricula_id=run.matricula_id and x.cycle_number=run.cycle_number)
 order by run.matricula_id,run.cycle_number for update;
 perform 1 from internal_financial_correction.items where operation_id=o.id order by receivable_id for update;
 perform 1 from public.contas_receber x where exists(select 1 from internal_financial_correction.items
   where operation_id=o.id and receivable_id=x.id) order by x.id for update;
 perform 1 from internal_academic.technical_manual_receivable_issuance_authorizations x
 where exists(select 1 from internal_financial_correction.items where operation_id=o.id and receivable_id=x.receivable_id)
 order by x.receivable_id for update;
 perform 1 from public.payment_gateway_transactions x where exists(select 1 from internal_financial_correction.items
   where operation_id=o.id and transaction_id=x.id) order by x.id for update;
 perform 1 from public.banese_reconciliation_queue x where exists(select 1 from internal_financial_correction.items
   where operation_id=o.id and receivable_id=x.receivable_id) order by x.receivable_id for update;
 for i in select * from internal_financial_correction.items where operation_id=o.id order by receivable_id loop
   perform internal_financial_correction.check_item(o.id,i.receivable_id);
   if i.kind<>'LOCAL_WAIVER' and (i.bank_evidence is null or i.bank_evidence_hash is distinct from
     internal_financial_correction.sha256(i.bank_evidence::text)) then raise exception 'BOUNDED_BANK_PROOF_CHANGED'; end if;
 end loop;
 update internal_financial_correction.operations set finalizing_xid=txid_current() where id=o.id;
 perform set_config('app.bounded_financial_correction_id',o.id::text,true);
 for i in select * from internal_financial_correction.items where operation_id=o.id order by receivable_id loop
   select * into strict r from public.contas_receber where id=i.receivable_id;
   n:=clock_timestamp();
   if i.kind='LOCAL_WAIVER' then
     update public.contas_receber set status='CANCELADO',updated_at=n
     where id=r.id and to_jsonb(contas_receber)=i.receivable_snapshot;
     get diagnostics changed=row_count;
     if changed<>1 then raise exception 'BOUNDED_LOCAL_WAIVER_CAS'; end if;
   elsif i.kind='CANCEL_C2' then
     update public.payment_gateway_transactions set remote_status='CANCELED',last_error=null,synced_at=n,updated_at=n
     where id=i.transaction_id;
     update public.contas_receber set status='CANCELADO',gateway_status='CANCELED',
       gateway_synced_at=n,gateway_last_error=null,updated_at=n where id=r.id;
   else
     select * into strict t from public.payment_gateway_transactions where id=i.transaction_id;
     select * into strict a from internal_academic.technical_manual_receivable_issuance_authorizations where receivable_id=r.id;
     bank:=i.bank_evidence->'bankResult';
     insert into internal_academic.technical_manual_banese_reissue_jobs(
       receivable_id,matricula_id,turma_id,cycle_number,cycle_request_id,expected_item_count,
       recovery_request_id,original_actor_id,canceled_nosso_numero,convenio,agency,expected_amount,
       expected_due_date,receivable_fingerprint,expected_receivable_updated_at,lease_valid_until,
       status,cancel_mutation_intent_at,cancel_mutation_intent_count)
     values(r.id,r.matricula_id,r.turma_id,1,(i.run_snapshot->>'request_id')::uuid,
       (i.run_snapshot->>'item_count')::integer,a.request_id,a.authorized_by,
       r.gateway_boleto_nosso_numero,r.gateway_boleto_convenio,r.gateway_boleto_agencia,r.valor,
       r.data_vencimento,a.receivable_fingerprint,r.updated_at,n+interval '5 minutes',
       'CANCEL_CONFIRMED',i.intent_at,case when i.intent_at is null then 0 else 1 end) returning * into j;
     insert into internal_academic.technical_manual_banese_reissue_archive(
       job_id,receivable_id,matricula_id,turma_id,cycle_number,cycle_request_id,recovery_request_id,
       original_actor_id,canceled_nosso_numero,environment,convenio,agency,expected_amount,
       expected_due_date,receivable_fingerprint,remote_cancel_status,remote_cancel_situation_code,
       remote_cancel_confirmed_at,remote_cancel_fingerprint,remote_cancel_observed_pre_canceled,
       remote_cancel_put_attempted,cancel_mutation_intent_at,gateway_pre_snapshot,financial_terms_snapshot)
     values(j.id,r.id,r.matricula_id,r.turma_id,1,j.cycle_request_id,a.request_id,a.authorized_by,
       j.canceled_nosso_numero,'production',j.convenio,j.agency,j.expected_amount,j.expected_due_date,
       j.receivable_fingerprint,'CANCELED',5,(i.bank_evidence->>'confirmedAt')::timestamptz,
       i.bank_evidence_hash,(bank->>'alreadyCanceled')::boolean,(bank->>'mutationAttempted')::boolean,
       case when (bank->>'mutationAttempted')::boolean then i.intent_at else null end,
       to_jsonb(r),r.gateway_financial_terms);
     update public.payment_gateway_transactions set receivable_id=null,remote_status='CANCELED',last_error=null,
       synced_at=n,updated_at=n where id=t.id;
     update public.contas_receber set data_vencimento=i.corrected_due_date,gateway_financial_terms=i.corrected_terms,
       gateway_payment_id=null,gateway_customer_id=null,gateway_payment_link_id=null,gateway_installment_id=null,
       gateway_status=null,gateway_invoice_url=null,gateway_bank_slip_url=null,gateway_pix_payload=null,
       gateway_pix_encoded_image=null,gateway_transaction_receipt_url=null,gateway_fee_value=null,
       gateway_net_value=null,gateway_synced_at=null,gateway_last_error=null,gateway_boleto_linha_digitavel=null,
       gateway_boleto_codigo_barras=null,gateway_boleto_nosso_numero=null,gateway_boleto_issued_at=null,
       gateway_financial_terms_confirmed_at=null,gateway_creation_token=null,gateway_submission_channel=null,
       gateway_submission_status=null,gateway_cnab_file_id=null,updated_at=n where id=r.id;
     -- Prior authorization is deliberately NOT rotated/revalidated here. Its old
     -- fingerprint remains unusable until explicit fresh real-user consent.
     update internal_academic.technical_manual_banese_reissue_jobs set status='RESET_COMPLETE',
       reset_completed_at=n,updated_at=n where id=j.id;
     update internal_financial_correction.items set job_id=j.id where operation_id=o.id and receivable_id=r.id;
   end if;
   update public.banese_reconciliation_queue set state='DONE',next_check_at=null,lease_run_id=null,
     lease_until=null,last_result=case when i.kind='RESET_C1' then 'AWAITING_EXPLICIT_CORRECTION_CONSENT' else 'CANCELED' end,
     updated_at=n where receivable_id=r.id;
   update internal_financial_correction.items set state='FINALIZED',finalized_at=n,lease_until=null
     where operation_id=o.id and receivable_id=r.id;
   perform internal_financial_correction.audit_event(o.id,r.id,'INTERNAL_FINALIZED',jsonb_build_object(
     'kind',i.kind,'oldDueDate',r.data_vencimento,'correctedDueDate',i.corrected_due_date,
     'bankProofHash',i.bank_evidence_hash,'requiresNewConsent',i.kind='RESET_C1',
     'moneyMoved',false,'originalPaidFeeUnchanged',true));
 end loop;
 update internal_financial_correction.operations set state='FINALIZED',finalizing_xid=null,completed_at=clock_timestamp() where id=o.id;
 perform set_config('app.bounded_financial_correction_id',coalesce(previous_context,''),true);
 perform internal_financial_correction.assert_finalized_operation(o.id);
 return jsonb_build_object('finalized',true,'replayed',false,'resetCount',36,'canceledC2Count',13,'waivedLocalCount',5,'emitted',0);
end $$;
revoke all on all functions in schema internal_financial_correction from public,anon,authenticated,service_role;
commit;
