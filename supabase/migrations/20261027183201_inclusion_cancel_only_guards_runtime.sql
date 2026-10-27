-- REVIEW DRAFT ONLY. All entrypoints remain ungranted.
begin;
create function internal_inclusion_cancellation.operation(p_id uuid,p_fingerprint text default null,
 p_audit_only boolean default false,p_allow_prepared boolean default false)
returns internal_inclusion_cancellation.operations language plpgsql security definer set search_path='' as $$
declare o internal_inclusion_cancellation.operations%rowtype; run jsonb; enrollment jsonb;
begin
 select * into o from internal_inclusion_cancellation.operations where id=p_id for update;
 if not found then raise exception 'INCLUSION_OPERATION_NOT_FOUND' using errcode='42501'; end if;
 if o.execution_actor_kind is distinct from 'SYSTEM_MAINTENANCE'
  or o.requester_channel is distinct from 'CHAT_OWNER' then raise exception 'INCLUSION_AUTHORITY_INVALID'; end if;
 if not p_allow_prepared and not p_audit_only and (not o.execution_enabled or o.approved_at is null
  or o.state not in('APPROVED','COMPLETE')) then raise exception 'INCLUSION_NOT_APPROVED'; end if;
 if o.fingerprint is distinct from internal_inclusion_cancellation.hash(o.canonical_text)
  or o.plan_fingerprint is distinct from internal_inclusion_cancellation.hash(o.plan::text)
  or (p_fingerprint is not null and o.fingerprint is distinct from p_fingerprint)
  or o.canonical_text::jsonb->>'operationId' is distinct from o.id::text
  or o.canonical_text::jsonb->>'purpose' is distinct from o.purpose
  or o.plan->>'manifest' is distinct from o.canonical_text
  or o.plan->>'executionActorKind' is distinct from o.execution_actor_kind
  or o.plan->>'requesterChannel' is distinct from o.requester_channel
  or o.plan->>'approvalReference' is distinct from o.approval_reference
  or o.plan->>'approvalHash' is distinct from o.approval_hash
  or o.plan->>'reason' is distinct from o.reason
  or o.plan->'run' is distinct from o.run_snapshot
  or o.plan->'enrollment' is distinct from o.enrollment_snapshot
  or (select count(*) from internal_inclusion_cancellation.items where operation_id=o.id)<>o.item_count
  or (select jsonb_agg(identity_snapshot order by position) from internal_inclusion_cancellation.items
   where operation_id=o.id) is distinct from o.canonical_text::jsonb->'items'
  or exists(select 1 from internal_inclusion_cancellation.items i
   left join lateral(select x from jsonb_array_elements(o.plan->'sources') x
    where x#>>'{identity,receivableId}'=i.receivable_id::text) p on true
   where i.operation_id=o.id and (p.x is null or p.x->'receivable' is distinct from i.receivable_snapshot
    or p.x->'transaction' is distinct from i.transaction_snapshot
    or p.x->'authorization' is distinct from i.authorization_snapshot
    or p.x->'identity' is distinct from i.identity_snapshot))
 then raise exception 'INCLUSION_MANIFEST_CHANGED'; end if;
 if p_audit_only then return o; end if;
 select to_jsonb(r) into run from internal_academic.technical_manual_cycle_runs r
  where matricula_id=o.matricula_id and cycle_number=o.cycle_number for share;
 select to_jsonb(m) into enrollment from public.matriculas m where id=o.matricula_id for share;
 if run is distinct from o.run_snapshot or enrollment is distinct from o.enrollment_snapshot then
  raise exception 'INCLUSION_RUN_OR_ENROLLMENT_CHANGED'; end if;
 return o;
end $$;
create function internal_inclusion_cancellation.check_item(p_operation_id uuid,p_receivable_id uuid)
returns internal_inclusion_cancellation.items language plpgsql security definer set search_path='' as $$
declare i internal_inclusion_cancellation.items%rowtype; title jsonb;
begin
 select * into i from internal_inclusion_cancellation.items
  where operation_id=p_operation_id and receivable_id=p_receivable_id for update;
 if not found then raise exception 'INCLUSION_ITEM_OUTSIDE_MANIFEST'; end if;
 title:=internal_inclusion_cancellation.source(i.receivable_id,i.state='COMPLETE');
 if title->'identity' is distinct from i.identity_snapshot
  or title->'authorization' is distinct from i.authorization_snapshot
  or title->>'transactionId' is distinct from i.transaction_id::text
 then raise exception 'INCLUSION_IDENTITY_CHANGED'; end if;
 if i.state='COMPLETE' then
  if i.evidence is null or i.evidence_hash is distinct from internal_inclusion_cancellation.hash(i.evidence::text)
   or title->'receivable' is distinct from i.post_receivable_snapshot
   or title->'transaction' is distinct from i.post_transaction_snapshot
  then raise exception 'INCLUSION_COMPLETED_PROOF_CHANGED'; end if;
 else
  if title->'receivable' is distinct from i.receivable_snapshot
   or title->'transaction' is distinct from i.transaction_snapshot
  then raise exception 'INCLUSION_SOURCE_CAS_CHANGED'; end if;
 end if;
 return i;
end $$;
create function internal_inclusion_cancellation.approve_operation(p_operation_id uuid,p_plan_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o internal_inclusion_cancellation.operations%rowtype; i record;
begin
 o:=internal_inclusion_cancellation.operation(p_operation_id,null,false,true);
 if p_plan_fingerprint is null or p_plan_fingerprint is distinct from o.plan_fingerprint then
  raise exception 'INCLUSION_APPROVAL_PLAN_CHANGED'; end if;
 for i in select receivable_id from internal_inclusion_cancellation.items
  where operation_id=o.id order by position loop
  perform internal_inclusion_cancellation.check_item(o.id,i.receivable_id);
 end loop;
 if o.state='PREPARED' then
  update internal_inclusion_cancellation.operations set state='APPROVED',execution_enabled=true,
   approved_at=clock_timestamp() where id=o.id;
  -- Remove only this approved scope from normal polling while its immutable
  -- cancellation snapshots are active. Existing leases were rejected above.
  update public.banese_reconciliation_queue q set state='DONE',next_check_at=null,
   lease_run_id=null,lease_until=null,last_result='CANCELLATION_IN_PROGRESS',updated_at=clock_timestamp()
   where exists(select 1 from internal_inclusion_cancellation.items scope_item
    where scope_item.operation_id=o.id and scope_item.receivable_id=q.receivable_id);
  insert into internal_inclusion_cancellation.events(operation_id,event) values(o.id,'APPROVED');
 elsif not o.execution_enabled then raise exception 'INCLUSION_DISABLED'; end if;
 return internal_inclusion_cancellation.manifest(o.id);
end $$;
create function public.load_inclusion_cancellation_service(p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o internal_inclusion_cancellation.operations%rowtype;
begin
 perform internal_financial_correction.service_only();
 o:=internal_inclusion_cancellation.operation(p_operation_id);
 return internal_inclusion_cancellation.manifest(o.id);
end $$;
create function public.claim_inclusion_cancellation_service(p_operation_id uuid,p_receivable_id uuid,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o internal_inclusion_cancellation.operations%rowtype; i internal_inclusion_cancellation.items%rowtype;
 token uuid; claim_mode text;
begin
 perform internal_financial_correction.service_only();
 if coalesce(p_fingerprint,'') !~ '^[a-f0-9]{64}$' then raise exception 'INCLUSION_FINGERPRINT_REQUIRED'; end if;
 o:=internal_inclusion_cancellation.operation(p_operation_id,p_fingerprint);
 i:=internal_inclusion_cancellation.check_item(o.id,p_receivable_id);
 if i.state='COMPLETE' then token:=i.lease_token;claim_mode:='COMPLETE';
 else
  if i.lease_until>clock_timestamp() then raise exception 'INCLUSION_LEASE_ACTIVE'; end if;
  claim_mode:=case when i.intent_at is not null or i.state='REVIEW' then 'CONFIRM_ONLY' else 'CANCEL_ALLOWED' end;
  token:=gen_random_uuid();
  update internal_inclusion_cancellation.items set state='LEASED',lease_token=token,
   lease_until=clock_timestamp()+interval '2 minutes',attempts=attempts+1
   where operation_id=o.id and receivable_id=i.receivable_id;
  insert into internal_inclusion_cancellation.events(operation_id,receivable_id,event,details)
   values(o.id,i.receivable_id,'CLAIMED',jsonb_build_object('mode',claim_mode));
 end if;
 return jsonb_build_object('operationId',o.id,'manifestFingerprint',o.fingerprint,
  'item',i.identity_snapshot,'leaseToken',token,'mode',claim_mode);
end $$;
create function public.start_inclusion_cancellation_service(p_operation_id uuid,p_receivable_id uuid,
 p_fingerprint text,p_lease_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o internal_inclusion_cancellation.operations%rowtype; i internal_inclusion_cancellation.items%rowtype;
begin
 perform internal_financial_correction.service_only();
 if coalesce(p_fingerprint,'') !~ '^[a-f0-9]{64}$' then raise exception 'INCLUSION_FINGERPRINT_REQUIRED'; end if;
 o:=internal_inclusion_cancellation.operation(p_operation_id,p_fingerprint);
 i:=internal_inclusion_cancellation.check_item(o.id,p_receivable_id);
 if i.state<>'LEASED' or i.lease_token is distinct from p_lease_token or i.lease_until is null
  or i.lease_until<=clock_timestamp() or i.intent_at is not null or i.review_reason is not null
 then raise exception 'INCLUSION_INTENT_LEASE_OR_REPLAY'; end if;
 update internal_inclusion_cancellation.items set state='INTENT',intent_at=clock_timestamp(),
  lease_until=clock_timestamp()+interval '2 minutes' where operation_id=o.id and receivable_id=i.receivable_id;
 update public.banese_reconciliation_queue set state='DONE',next_check_at=null,lease_run_id=null,
  lease_until=null,last_result='CANCELLATION_IN_PROGRESS',updated_at=clock_timestamp() where receivable_id=i.receivable_id;
 insert into internal_inclusion_cancellation.events(operation_id,receivable_id,event) values(o.id,i.receivable_id,'INTENT');
 return jsonb_build_object('started',true);
end $$;
create function public.review_inclusion_cancellation_service(p_operation_id uuid,p_receivable_id uuid,
 p_fingerprint text,p_lease_token uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o internal_inclusion_cancellation.operations%rowtype; i internal_inclusion_cancellation.items%rowtype;
begin
 perform internal_financial_correction.service_only();
 if coalesce(p_fingerprint,'') !~ '^[a-f0-9]{64}$' then raise exception 'INCLUSION_FINGERPRINT_REQUIRED'; end if;
 o:=internal_inclusion_cancellation.operation(p_operation_id,p_fingerprint,true);
 select * into i from internal_inclusion_cancellation.items
  where operation_id=o.id and receivable_id=p_receivable_id for update;
 if not found or i.lease_token is distinct from p_lease_token or i.state='COMPLETE'
  or p_reason is null or p_reason not in('REMOTE_OR_GUARD_REVIEW','REMOTE_AMBIGUOUS','LOCAL_SYNC_AFTER_REMOTE')
 then raise exception 'INCLUSION_REVIEW_SCOPE'; end if;
 -- Audit must remain possible after revocation, local payment or changed source.
 update internal_inclusion_cancellation.items set state='REVIEW',review_reason=p_reason,lease_until=null
  where operation_id=o.id and receivable_id=i.receivable_id;
 insert into internal_inclusion_cancellation.events(operation_id,receivable_id,event,details)
  values(o.id,i.receivable_id,'REVIEW',jsonb_build_object('reason',p_reason));
 return jsonb_build_object('reviewed',true);
end $$;
revoke all on all functions in schema internal_inclusion_cancellation from public,anon,authenticated,service_role;
revoke all on function public.load_inclusion_cancellation_service(uuid) from public,anon,authenticated,service_role;
revoke all on function public.claim_inclusion_cancellation_service(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.start_inclusion_cancellation_service(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.review_inclusion_cancellation_service(uuid,uuid,text,uuid,text) from public,anon,authenticated,service_role;
commit;
