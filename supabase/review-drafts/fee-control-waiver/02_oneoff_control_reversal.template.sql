-- PRIVATE REVIEW TEMPLATE. Requires explicit approval of this temporary guard change.
-- Render the single JSON placeholder with SQL-escaped values; never publish real inputs.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create function internal_financial_correction._control_reversal_transition(
 p_old public.contas_receber,p_new public.contas_receber)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if session_user<>'postgres' or auth.uid() is not null or coalesce(auth.role(),'')<>''
  or p_old.status is distinct from 'PAGO' or p_new.status is distinct from 'PENDENTE'
 then return false; end if;
 return exists(select 1 from public.receivable_manual_settlement_events e
  where e.settlement_id=p_old.manual_settlement_id
   and e.event_type='LOCAL_SETTLEMENT_REVERSED'
   and e.details->>'operation'='REVERSED_CONTROL_AND_WAIVED'
   and e.details->>'databaseTxid'=txid_current()::text
   and e.details->'receiptBefore'=to_jsonb(p_old)
   and internal_financial_correction.reversed_control_waiver_complete(
    jsonb_populate_record(null::public.contas_receber,to_jsonb(p_new)||'{"status":"CANCELADO"}'::jsonb)));
end $$;
revoke all on function internal_financial_correction._control_reversal_transition(public.contas_receber,public.contas_receber)
 from public,anon,authenticated,service_role;

do $$
declare input jsonb:='__MAINTENANCE_INPUT_JSON__'::jsonb;
 original_guard text; original_acl aclitem[]; guard_oid oid;
 guard_hash text; n timestamptz; actor uuid; event_row public.receivable_manual_settlement_events%rowtype;
 o internal_financial_correction.operations%rowtype;
 run internal_academic.technical_manual_cycle_runs%rowtype;
 s public.receivable_manual_settlements%rowtype; r public.contas_receber%rowtype;
 before_c1 jsonb; after_c1 jsonb; before_auth jsonb; after_auth jsonb;
 before_items jsonb; after_items jsonb; operation_before jsonb; original_run jsonb;
begin
 if session_user<>'postgres' or auth.uid() is not null or coalesce(auth.role(),'')<>''
  or length(coalesce(input->>'approvalReference',''))<8
  or coalesce(input->>'approvalHash','')!~'^[a-f0-9]{64}$'
  or length(coalesce(input->>'securityApprovalReference',''))<8
  or coalesce(input->>'securityApprovalHash','')!~'^[a-f0-9]{64}$'
 then raise exception 'CONTROL_MAINTENANCE_APPROVAL_REQUIRED'; end if;
 guard_oid:='internal_academic.local_manual_reversal_authorized(public.contas_receber,public.contas_receber)'::regprocedure;
 select pg_get_functiondef(guard_oid),proacl into original_guard,original_acl from pg_proc where oid=guard_oid;
 guard_hash:=md5(original_guard);
 if guard_hash<>'d9c1c30859ea0708ebbea581cbfc941b'
  or guard_hash is distinct from input->>'expectedGuardHash'
 then raise exception 'CONTROL_GUARD_BASELINE_DRIFT'; end if;
 select * into strict o from internal_financial_correction.operations
  where id=(input->>'parentOperationId')::uuid for update;
 if o.state<>'FINALIZED' or o.plan_fingerprint is distinct from input->>'expectedParentFingerprint'
  or o.actor_id::text is distinct from input->>'approverAuthId'
  or not internal_financial_correction.actor_allowed(o.actor_id,o.polo_id)
 then raise exception 'CONTROL_PARENT_OR_APPROVER_CHANGED'; end if;
 operation_before:=to_jsonb(o);
 select id into strict actor from public.usuarios_sistema where auth_user_id=o.actor_id;
 select * into strict run from internal_academic.technical_manual_cycle_runs
  where matricula_id=(input#>>'{expectedReceipt,matricula_id}')::uuid and cycle_number=1 for update;
 original_run:=to_jsonb(run);
 if original_run is distinct from input->'expectedRun' then raise exception 'CONTROL_RUN_CHANGED'; end if;
 -- Match canonical reversal ordering: ledger before fee. Parent/run locks precede consent.
 select * into strict s from public.receivable_manual_settlements
  where id=(input#>>'{expectedSettlement,id}')::uuid for update;
 select * into strict r from public.contas_receber
  where id=(input#>>'{expectedReceipt,id}')::uuid for update;
 select * into event_row from public.receivable_manual_settlement_events where id=(input->>'eventId')::uuid;
 if found then
  if event_row.details->'receiptBefore' is distinct from input->'expectedReceipt'
   or event_row.details->'settlementBefore' is distinct from input->'expectedSettlement'
   or event_row.details->>'parentOperationId' is distinct from input->>'parentOperationId'
   or event_row.details->>'parentPlanFingerprint' is distinct from input->>'expectedParentFingerprint'
   or event_row.details->>'approverAuthId' is distinct from input->>'approverAuthId'
   or event_row.details->>'approvalReference' is distinct from input->>'approvalReference'
   or event_row.details->>'securityApprovalReference' is distinct from input->>'securityApprovalReference'
   or event_row.details->>'approvalHash' is distinct from input->>'approvalHash'
   or event_row.details->>'securityApprovalHash' is distinct from input->>'securityApprovalHash'
   or not internal_financial_correction.reversed_control_waiver_complete(r)
  then raise exception 'CONTROL_REPLAY_CONFLICT'; end if;
  return;
 end if;
 if to_jsonb(s) is distinct from input->'expectedSettlement'
  or to_jsonb(r) is distinct from input->'expectedReceipt'
  or s.receivable_id is distinct from r.id or r.manual_settlement_id is distinct from s.id
  or r.status is distinct from 'PAGO' or r.valor is distinct from 200::numeric or r.valor_pago is distinct from 200::numeric
  or r.manual_settlement_reversed_at is not null or s.state is distinct from 'COMPLETED'
  or s.reversed_at is not null or s.requires_remote_cancellation is distinct from false
  or s.provider_code is not null or s.remote_payment_id is not null or s.remote_payment_link_id is not null
  or not internal_academic.manual_cycle_local_receivable_complete(r)
  or internal_academic.manual_cycle_has_bank_fields(r)
  or r.id<>all(run.receivable_ids) or r.turma_id is distinct from o.turma_id or r.polo_id is distinct from o.polo_id
  or exists(select 1 from public.payment_gateway_transactions where receivable_id=r.id)
  or exists(select 1 from internal_proesc.obligation_links where receivable_id=r.id)
  or exists(select 1 from internal_financial_correction.items where receivable_id=r.id)
  or (select count(*) from public.receivable_manual_settlements where receivable_id=r.id)<>1
  or not exists(select 1 from public.matriculas m join public.turmas t on t.id=m.turma_id
    where m.id=r.matricula_id and m.turma_id=r.turma_id and m.aluno_id=r.cliente_id
    and t.polo_id=r.polo_id and m.status in ('ATIVO','PENDENTE'))
 then raise exception 'CONTROL_EXACT_FEE_OR_SETTLEMENT_CHANGED'; end if;
 perform 1 from internal_financial_correction.items where operation_id=o.id order by receivable_id for update;
 perform 1 from public.contas_receber where id=any(run.receivable_ids) order by id for update;
 perform 1 from internal_academic.technical_manual_receivable_issuance_authorizations
  where receivable_id=any(run.receivable_ids) order by receivable_id for update;
 if exists(select 1 from public.contas_receber bank_r where bank_r.id=any(run.receivable_ids)
   and bank_r.id<>r.id
   and not (internal_academic.technical_manual_banese_receivable_complete(bank_r)
     or internal_academic.technical_manual_banese_receivable_paid_issued(bank_r))
   and (bank_r.gateway_creation_token is not null or bank_r.gateway_submission_status is not null
     or exists(select 1 from public.payment_gateway_transactions t where t.receivable_id=bank_r.id)))
 then raise exception 'CONTROL_C1_BANK_WORK_IN_FLIGHT'; end if;
 select jsonb_agg(to_jsonb(x) order by x.id) into before_c1 from public.contas_receber x
  where x.id=any(run.receivable_ids) and x.id<>r.id;
 select jsonb_agg(to_jsonb(x) order by x.receivable_id) into before_auth
  from internal_academic.technical_manual_receivable_issuance_authorizations x where x.receivable_id=any(run.receivable_ids);
 select jsonb_agg(to_jsonb(x) order by x.receivable_id) into before_items
  from internal_financial_correction.items x where x.operation_id=o.id;
 if position(E'\nbegin\n' in original_guard)=0 then raise exception 'CONTROL_GUARD_BODY_DRIFT'; end if;
 -- Specifically approved temporary admission: exact event, source rows and current TX only.
 execute replace(original_guard,E'\nbegin\n',E'\nbegin\n  if internal_financial_correction._control_reversal_transition(p_old,p_new) then return true; end if;\n');
 n:=clock_timestamp();
 update public.receivable_manual_settlements set state='REVERSED',reversed_at=n where id=s.id;
 insert into public.receivable_manual_settlement_events(id,settlement_id,actor_id,event_type,details)
 values((input->>'eventId')::uuid,s.id,actor,'LOCAL_SETTLEMENT_REVERSED',jsonb_build_object(
  'operation','REVERSED_CONTROL_AND_WAIVED','executionActorKind','SERVICE_MAINTENANCE',
  'databaseSessionUser',session_user,'databaseTxid',txid_current()::text,'actorRole','APPROVER',
  'approverAuthId',o.actor_id,'parentOperationId',o.id,'parentPlanFingerprint',o.plan_fingerprint,
  'approvalReference',input->>'approvalReference','approvalHash',input->>'approvalHash',
  'securityApprovalReference',input->>'securityApprovalReference','securityApprovalHash',input->>'securityApprovalHash',
  'ownerConfirmedNoCash',true,'moneyMoved',false,'receivableId',r.id,'reversedAt',n::text,
  'receiptBefore',to_jsonb(r),'settlementBefore',to_jsonb(s),'runBefore',to_jsonb(run)));
 update public.contas_receber set status='PENDENTE',conta_bancaria_id=null,valor_pago=null,
  data_pagamento=null,forma_pagamento=null,origem_pagamento='LOCAL',manual_settlement_reversed_at=n,updated_at=n
  where id=r.id and to_jsonb(contas_receber)=input->'expectedReceipt' returning * into r;
 if not found then raise exception 'CONTROL_REVERSAL_CAS_FAILED'; end if;
 update public.contas_receber set status='CANCELADO',updated_at=n where id=r.id returning * into r;
 if not internal_financial_correction.reversed_control_waiver_complete(r)
  or not internal_financial_correction.local_waiver_complete(r)
 then raise exception 'CONTROL_WAIVER_PROOF_FAILED'; end if;
 execute original_guard;
 if pg_get_functiondef(guard_oid) is distinct from original_guard
  or (select proacl from pg_proc where oid=guard_oid) is distinct from original_acl
 then raise exception 'CONTROL_GUARD_NOT_RESTORED'; end if;
 select jsonb_agg(to_jsonb(x) order by x.id) into after_c1 from public.contas_receber x
  where x.id=any(run.receivable_ids) and x.id<>r.id;
 select jsonb_agg(to_jsonb(x) order by x.receivable_id) into after_auth
  from internal_academic.technical_manual_receivable_issuance_authorizations x where x.receivable_id=any(run.receivable_ids);
 select jsonb_agg(to_jsonb(x) order by x.receivable_id) into after_items
  from internal_financial_correction.items x where x.operation_id=o.id;
 if before_c1 is distinct from after_c1 or before_auth is distinct from after_auth or before_items is distinct from after_items
  or (select to_jsonb(x) from internal_academic.technical_manual_cycle_runs x where x.matricula_id=run.matricula_id and x.cycle_number=1) is distinct from original_run
  or (select to_jsonb(x) from internal_financial_correction.operations x where x.id=o.id) is distinct from operation_before
 then raise exception 'CONTROL_UNRELATED_STATE_CHANGED'; end if;
end $$;
drop function internal_financial_correction._control_reversal_transition(public.contas_receber,public.contas_receber);
commit;
