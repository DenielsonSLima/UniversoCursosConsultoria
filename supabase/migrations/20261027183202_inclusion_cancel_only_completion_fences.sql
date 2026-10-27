-- REVIEW DRAFT ONLY. Canonical strict bank worker attests; never browser evidence.
begin;
create function public.complete_inclusion_cancellation_service(p_operation_id uuid,p_receivable_id uuid,
 p_fingerprint text,p_lease_token uuid,p_evidence jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o internal_inclusion_cancellation.operations%rowtype; i internal_inclusion_cancellation.items%rowtype;
 bank jsonb; confirmed timestamptz; n timestamptz; changed integer; post_r jsonb; post_t jsonb;
begin
 perform internal_financial_correction.service_only();
 if coalesce(p_fingerprint,'') !~ '^[a-f0-9]{64}$' then raise exception 'INCLUSION_FINGERPRINT_REQUIRED'; end if;
 o:=internal_inclusion_cancellation.operation(p_operation_id,p_fingerprint);
 i:=internal_inclusion_cancellation.check_item(o.id,p_receivable_id);
 if i.lease_token is distinct from p_lease_token then raise exception 'INCLUSION_LEASE_MISMATCH'; end if;
 if i.state='COMPLETE' then
  if i.evidence is distinct from p_evidence then raise exception 'INCLUSION_COMPLETION_REPLAY_CONFLICT'; end if;
  return jsonb_build_object('completed',true,'replayed',true);
 end if;
 if i.state not in('LEASED','INTENT') or i.lease_until is null or i.lease_until<=clock_timestamp()
 then raise exception 'INCLUSION_LEASE_EXPIRED'; end if;
 if jsonb_typeof(p_evidence) is distinct from 'object'
  or jsonb_typeof(p_evidence->'bankResult') is distinct from 'object'
  or coalesce(p_evidence->>'evidenceFingerprint','') !~ '^[a-f0-9]{64}$'
 then raise exception 'INCLUSION_EVIDENCE_MISSING'; end if;
 bank:=p_evidence->'bankResult'; confirmed:=(p_evidence->>'confirmedAt')::timestamptz;
 if confirmed is null or confirmed<clock_timestamp()-interval '2 minutes'
  or confirmed>clock_timestamp()+interval '30 seconds'
  or bank->>'convenio' is distinct from i.identity_snapshot->>'convenio'
  or bank->>'nossoNumero' is distinct from i.identity_snapshot->>'nossoNumero'
  or bank->'situationCode' is distinct from '5'::jsonb
  or bank->>'remoteStatus' is distinct from 'CANCELED'
  or coalesce(bank#>>'{raw,CodigoSituacaoBoleto}',bank#>>'{raw,codigoSituacaoBoleto}') is distinct from '5'
  or bank#>'{proof,strictEffectivePayments}' is distinct from 'true'::jsonb
  or bank#>'{proof,paymentsCount}' is distinct from '0'::jsonb
  or bank#>'{proof,identityValidated}' is distinct from 'true'::jsonb
  or bank#>'{proof,termsValidated}' is distinct from 'true'::jsonb
  or jsonb_typeof(bank->'alreadyCanceled') is distinct from 'boolean'
  or jsonb_typeof(bank->'mutationAttempted') is distinct from 'boolean'
  or bank->'alreadyCanceled'=bank->'mutationAttempted'
  or (bank->'mutationAttempted'='true'::jsonb and (i.state<>'INTENT' or i.intent_at is null))
  or (i.state='INTENT' and bank->'mutationAttempted' is distinct from 'true'::jsonb)
 then raise exception 'INCLUSION_BANK_CONFIRMATION_INVALID'; end if;
 -- Recovery claim after uncertain PUT is LEASED + original intent; fresh GET can
 -- prove already canceled without claiming another mutation was attempted.
 n:=clock_timestamp();
 update internal_inclusion_cancellation.items set evidence=p_evidence,
  evidence_hash=internal_inclusion_cancellation.hash(p_evidence::text)
  where operation_id=o.id and receivable_id=i.receivable_id;
 update internal_inclusion_cancellation.operations set finalizing_xid=txid_current() where id=o.id;
 -- Source locks and full snapshots were checked above. Never clear bank references.
 update public.payment_gateway_transactions t set remote_status='CANCELED',last_error=null,synced_at=n,updated_at=n
  where t.id=i.transaction_id and to_jsonb(t)=i.transaction_snapshot;
 get diagnostics changed=row_count;
 if changed<>1 then raise exception 'INCLUSION_TRANSACTION_CAS'; end if;
 update public.contas_receber r set status='CANCELADO',gateway_status='CANCELED',
  gateway_synced_at=n,gateway_last_error=null,updated_at=n
  where r.id=i.receivable_id and to_jsonb(r)=i.receivable_snapshot;
 get diagnostics changed=row_count;
 if changed<>1 then raise exception 'INCLUSION_RECEIVABLE_CAS'; end if;
 update public.banese_reconciliation_queue set state='DONE',next_check_at=null,lease_run_id=null,
  lease_until=null,last_result='CANCELED',updated_at=n where receivable_id=i.receivable_id;
 select to_jsonb(r) into strict post_r from public.contas_receber r where id=i.receivable_id;
 select to_jsonb(t) into strict post_t from public.payment_gateway_transactions t where id=i.transaction_id;
 if post_r->>'status' is distinct from 'CANCELADO' or post_t->>'remote_status' is distinct from 'CANCELED'
 then raise exception 'INCLUSION_POST_STATE'; end if;
 update internal_inclusion_cancellation.items set state='COMPLETE',completed_at=n,lease_until=null,
  post_receivable_snapshot=post_r,post_transaction_snapshot=post_t
  where operation_id=o.id and receivable_id=i.receivable_id;
 update internal_inclusion_cancellation.operations set finalizing_xid=null where id=o.id;
 insert into internal_inclusion_cancellation.events(operation_id,receivable_id,event,details)
  values(o.id,i.receivable_id,'COMPLETE',jsonb_build_object('evidenceHash',
   internal_inclusion_cancellation.hash(p_evidence::text),'reissued',false,'academicChanged',false));
 if not exists(select 1 from internal_inclusion_cancellation.items where operation_id=o.id and state<>'COMPLETE') then
  update internal_inclusion_cancellation.operations set state='COMPLETE',completed_at=n where id=o.id;
 end if;
 return jsonb_build_object('completed',true,'replayed',false);
end $$;
create function internal_inclusion_cancellation.active(p_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from internal_inclusion_cancellation.items i
 join internal_inclusion_cancellation.operations o on o.id=i.operation_id
 where i.receivable_id=p_id and i.state<>'COMPLETE'
 and ((o.execution_enabled and o.state='APPROVED') or i.intent_at is not null));
$$;
create function internal_inclusion_cancellation.finalizing(p_id uuid)
returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from internal_inclusion_cancellation.items i
 join internal_inclusion_cancellation.operations o on o.id=i.operation_id
 where i.receivable_id=p_id and o.finalizing_xid=txid_current()
 and i.evidence is not null and i.evidence_hash=internal_inclusion_cancellation.hash(i.evidence::text));
$$;
create function internal_inclusion_cancellation.fence_new_operation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.receivable_id is null or not exists(select 1 from internal_inclusion_cancellation.items
  where receivable_id=new.receivable_id) then return new; end if;
 if current_setting('transaction_isolation')<>'read committed' then raise exception 'INCLUSION_FRESH_SNAPSHOT_REQUIRED'; end if;
 perform 1 from public.contas_receber where id=new.receivable_id for update;
 -- Never issue a replacement for a completed cancellation through another path.
 if internal_inclusion_cancellation.active(new.receivable_id)
  or exists(select 1 from internal_inclusion_cancellation.items where receivable_id=new.receivable_id and state='COMPLETE')
 then raise exception 'INCLUSION_OTHER_OPERATION_FENCED'; end if;
 return new;
end $$;
create trigger a01_inclusion_settlement_fence before insert on public.receivable_manual_settlements
 for each row execute function internal_inclusion_cancellation.fence_new_operation();
create trigger a01_inclusion_reissue_fence before insert on internal_academic.technical_manual_banese_reissue_jobs
 for each row execute function internal_inclusion_cancellation.fence_new_operation();
create trigger a01_inclusion_cancellation_fence before insert on public.banese_cancellation_outbox
 for each row execute function internal_inclusion_cancellation.fence_new_operation();
create trigger a01_inclusion_renegotiation_fence before insert on public.receivable_renegotiation_source_items
 for each row execute function internal_inclusion_cancellation.fence_new_operation();
create function internal_inclusion_cancellation.fence_queue()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not internal_inclusion_cancellation.active(new.receivable_id) then return new; end if;
 if exists(select 1 from public.contas_receber r where r.id=new.receivable_id
  and internal_financial_correction.has_payment_evidence(r)) then return new; end if;
 if new.state='LEASED' or new.lease_run_id is not null or new.lease_until is not null
 then raise exception 'INCLUSION_RECONCILIATION_FENCED'; end if;
 if new.state='READY' then new.state:='DONE';new.next_check_at:=null;
  new.last_result:='CANCELLATION_IN_PROGRESS'; end if;
 return new;
end $$;
create trigger a01_inclusion_queue_fence before insert or update on public.banese_reconciliation_queue
 for each row execute function internal_inclusion_cancellation.fence_queue();
create function internal_inclusion_cancellation.fence_receivable()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from internal_inclusion_cancellation.items where receivable_id=old.id) then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 if tg_op='DELETE' then raise exception 'INCLUSION_HISTORY_IMMUTABLE'; end if;
 if internal_inclusion_cancellation.finalizing(old.id) then return new; end if;
 -- True payment evidence is never discarded; every later execution rechecks it.
 if internal_financial_correction.has_payment_evidence(new) then return new; end if;
 if internal_inclusion_cancellation.active(old.id) or exists(select 1 from internal_inclusion_cancellation.items
  where receivable_id=old.id and state='COMPLETE') then raise exception 'INCLUSION_RECEIVABLE_FENCED'; end if;
 return new;
end $$;
create trigger a01_inclusion_receivable_fence before update or delete on public.contas_receber
 for each row execute function internal_inclusion_cancellation.fence_receivable();
create function internal_inclusion_cancellation.fence_transaction()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.receivable_id is null or not exists(select 1 from internal_inclusion_cancellation.items
  where transaction_id=old.id) then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 if tg_op='DELETE' then raise exception 'INCLUSION_HISTORY_IMMUTABLE'; end if;
 if internal_inclusion_cancellation.finalizing(old.receivable_id) then return new; end if;
 if upper(coalesce(new.remote_status,'')) in('PAID','RECEIVED','CONFIRMED','PAGO','LIQUIDATED','PARTIALLY_PAID','PROCESSING')
  or nullif(new.transaction_receipt_url,'') is not null then return new; end if;
 if internal_inclusion_cancellation.active(old.receivable_id)
  or exists(select 1 from internal_inclusion_cancellation.items where transaction_id=old.id and state='COMPLETE')
 then raise exception 'INCLUSION_TRANSACTION_FENCED'; end if;
 return new;
end $$;
create trigger a01_inclusion_transaction_fence before update or delete on public.payment_gateway_transactions
 for each row execute function internal_inclusion_cancellation.fence_transaction();
create trigger a01_inclusion_new_transaction_fence before insert on public.payment_gateway_transactions
 for each row execute function internal_inclusion_cancellation.fence_new_operation();
create trigger a01_inclusion_authorization_fence before insert or update on internal_academic.technical_manual_receivable_issuance_authorizations
 for each row execute function internal_inclusion_cancellation.fence_new_operation();
create function internal_inclusion_cancellation.fence_run()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from internal_inclusion_cancellation.operations o
  where o.matricula_id=old.matricula_id and o.cycle_number=old.cycle_number
   and (o.state='COMPLETE' or o.execution_enabled or exists(select 1 from internal_inclusion_cancellation.items i
    where i.operation_id=o.id and i.intent_at is not null)))
 then raise exception 'INCLUSION_SOURCE_RUN_IMMUTABLE'; end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
create trigger a01_inclusion_run_fence before update or delete on internal_academic.technical_manual_cycle_runs
 for each row execute function internal_inclusion_cancellation.fence_run();
revoke all on all functions in schema internal_inclusion_cancellation from public,anon,authenticated,service_role;
revoke all on function public.complete_inclusion_cancellation_service(uuid,uuid,text,uuid,jsonb)
 from public,anon,authenticated,service_role;
commit;
