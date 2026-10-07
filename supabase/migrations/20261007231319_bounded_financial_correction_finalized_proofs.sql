-- Durable proofs for preserved history and active corrected obligations.
begin;
create function internal_financial_correction.local_waiver_complete(r public.contas_receber)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from internal_financial_correction.items i
 join internal_financial_correction.operations o on o.id=i.operation_id
 join internal_academic.technical_manual_cycle_runs run on run.matricula_id=i.matricula_id and run.cycle_number=1
 where i.receivable_id=r.id and i.kind='LOCAL_WAIVER' and i.state='FINALIZED' and i.finalized_at is not null
 and o.state='FINALIZED' and r.status='CANCELADO' and to_jsonb(run)=i.run_snapshot
 and r.id=any(run.receivable_ids) and r.tipo_lancamento='MATRICULA' and r.parcela_numero=0
 and r.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL'
 and internal_academic.manual_cycle_has_local_intent(r)
 and (to_jsonb(r)-array['status','updated_at'])=(i.receivable_snapshot-array['status','updated_at'])
 and not internal_financial_correction.has_payment_evidence(r)
 and not exists(select 1 from public.payment_gateway_transactions t where t.receivable_id=r.id));
$$;

create function internal_financial_correction.assert_finalized_operation(p_operation_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare o internal_financial_correction.operations%rowtype; i internal_financial_correction.items%rowtype;
 r public.contas_receber%rowtype; t public.payment_gateway_transactions%rowtype;
 a internal_academic.technical_manual_receivable_issuance_authorizations%rowtype;
 ignore_tx text[]:=array['receivable_id','remote_status','last_error','synced_at','updated_at'];
begin
 o:=internal_financial_correction.assert_operation(p_operation_id);
 if o.state<>'FINALIZED' then raise exception 'BOUNDED_INTERNAL_STAGE_PENDING'; end if;
 for i in select * from internal_financial_correction.items where operation_id=o.id order by receivable_id loop
  if i.state<>'FINALIZED' or i.finalized_at is null or not exists(select 1 from internal_academic.technical_manual_cycle_runs run
    where run.matricula_id=i.matricula_id and run.cycle_number=i.cycle_number and to_jsonb(run)=i.run_snapshot)
  then raise exception 'BOUNDED_PRESERVED_RUN_CHANGED'; end if;
  select * into strict r from public.contas_receber where id=i.receivable_id;
  if i.kind='LOCAL_WAIVER' then
    if not internal_financial_correction.local_waiver_complete(r) then raise exception 'BOUNDED_LOCAL_WAIVER_PROOF_CHANGED'; end if;
    continue;
  end if;
  select * into strict t from public.payment_gateway_transactions where id=i.transaction_id;
  if i.bank_evidence is null or i.bank_evidence_hash is distinct from internal_financial_correction.sha256(i.bank_evidence::text)
    or t.remote_status is distinct from 'CANCELED'
    or (to_jsonb(t)-ignore_tx) is distinct from (i.transaction_snapshot-ignore_tx)
  then raise exception 'BOUNDED_OLD_BANK_HISTORY_CHANGED'; end if;
  if i.kind='CANCEL_C2' then
    if t.receivable_id is distinct from r.id or r.status is distinct from 'CANCELADO'
      or r.gateway_status is distinct from 'CANCELED'
      or internal_financial_correction.has_payment_evidence(r)
      or (to_jsonb(r)-array['status','gateway_status','gateway_synced_at','gateway_last_error','updated_at'])
       is distinct from (i.receivable_snapshot-array['status','gateway_status','gateway_synced_at','gateway_last_error','updated_at'])
    then raise exception 'BOUNDED_C2_CANCELLATION_CONFLICT'; end if;
  else
    if t.receivable_id is not null or not internal_financial_correction.corrected_receivable_valid(r)
      or r.gateway_financial_terms is distinct from i.corrected_terms
      or not exists(select 1 from internal_academic.technical_manual_banese_reissue_jobs j
        join internal_academic.technical_manual_banese_reissue_archive ar on ar.job_id=j.id
        where j.id=i.job_id and j.receivable_id=r.id and j.status='RESET_COMPLETE'
        and ar.remote_cancel_situation_code=5 and ar.remote_cancel_fingerprint=i.bank_evidence_hash
        and ar.canceled_nosso_numero=i.identity_snapshot->>'nossoNumero')
    then raise exception 'BOUNDED_RESET_PROOF_CHANGED'; end if;
    select * into strict a from internal_academic.technical_manual_receivable_issuance_authorizations where receivable_id=r.id;
    if i.consent_at is null then
      if to_jsonb(a) is distinct from i.authorization_snapshot or internal_financial_correction.has_payment_evidence(r)
       or r.gateway_payment_id is not null or r.gateway_creation_token is not null or r.gateway_submission_status is not null
      then raise exception 'BOUNDED_UNCONSENTED_RESET_CHANGED'; end if;
    elsif a.request_id is distinct from i.consent_request_id or a.authorized_by is distinct from i.consent_actor_id
      or a.receivable_fingerprint is distinct from i.consent_fingerprint then
      raise exception 'BOUNDED_CONSENT_CHANGED';
    end if;
  end if;
 end loop;
end $$;

create function internal_financial_correction.corrected_fingerprint(p_operation_id uuid,p_matricula_id uuid)
returns text language sql stable security definer set search_path='' as $$
 select internal_financial_correction.sha256(jsonb_build_object('operationId',o.id,'planFingerprint',o.plan_fingerprint,
 'matriculaId',p_matricula_id,'items',jsonb_agg(jsonb_build_object('id',i.receivable_id,
 'key',i.receivable_snapshot->>'origem_cronograma_id','value',i.receivable_snapshot->>'valor',
 'dueDate',i.corrected_due_date,'financialTerms',i.corrected_terms) order by (i.receivable_snapshot->>'parcela_numero')::integer))::text)
 from internal_financial_correction.operations o join internal_financial_correction.items i on i.operation_id=o.id
 where o.id=p_operation_id and i.matricula_id=p_matricula_id and i.kind='RESET_C1' group by o.id;
$$;
revoke all on all functions in schema internal_financial_correction from public,anon,authenticated,service_role;
commit;
