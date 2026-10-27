-- REVIEW DRAFT ONLY. No seed, runtime grants, deployment or bank request.
begin;
create schema internal_inclusion_cancellation;
revoke all on schema internal_inclusion_cancellation from public,anon,authenticated,service_role;
create table internal_inclusion_cancellation.operations (
 id uuid primary key,
 execution_actor_kind text not null default 'SYSTEM_MAINTENANCE' check(execution_actor_kind='SYSTEM_MAINTENANCE'),
 requester_channel text not null default 'CHAT_OWNER' check(requester_channel='CHAT_OWNER'),
 database_session_name text not null default session_user,
 matricula_id uuid not null references public.matriculas(id),
 turma_id uuid not null references public.turmas(id),
 polo_id uuid not null references public.polos(id),
 cycle_number integer not null check(cycle_number in(1,2)),
 cycle_request_id uuid not null,
 purpose text not null default 'FINANCIAL_CORRECTION_CANCEL_ONLY'
   check(purpose='FINANCIAL_CORRECTION_CANCEL_ONLY'),
 approval_reference text not null check(length(approval_reference) between 8 and 512),
 approval_hash text not null check(approval_hash ~ '^[a-f0-9]{64}$'),
 reason text not null check(length(reason) between 10 and 1000),
 run_snapshot jsonb not null,
 enrollment_snapshot jsonb not null,
 canonical_text text not null,
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 plan jsonb not null,
 plan_fingerprint text not null check(plan_fingerprint ~ '^[a-f0-9]{64}$'),
 item_count integer not null check(item_count between 1 and 100),
 state text not null default 'PREPARED' check(state in('PREPARED','APPROVED','COMPLETE')),
 execution_enabled boolean not null default false,
 approved_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 completed_at timestamptz,
 finalizing_xid bigint,
 unique(matricula_id,cycle_number,cycle_request_id),
 check(state='PREPARED' or approved_at is not null)
);
create table internal_inclusion_cancellation.items (
 operation_id uuid not null references internal_inclusion_cancellation.operations(id),
 receivable_id uuid not null references public.contas_receber(id),
 position integer not null check(position between 1 and 100),
 transaction_id uuid not null references public.payment_gateway_transactions(id),
 identity_snapshot jsonb not null,
 receivable_snapshot jsonb not null,
 transaction_snapshot jsonb not null,
 authorization_snapshot jsonb not null,
 state text not null default 'READY' check(state in('READY','LEASED','INTENT','REVIEW','COMPLETE')),
 lease_token uuid,
 lease_until timestamptz,
 intent_at timestamptz,
 review_reason text,
 attempts integer not null default 0,
 evidence jsonb,
 evidence_hash text,
 completed_at timestamptz,
 post_receivable_snapshot jsonb,
 post_transaction_snapshot jsonb,
 last_dispatch_at timestamptz,
 primary key(operation_id,receivable_id),
 unique(receivable_id), unique(operation_id,position),
 check((evidence is null and evidence_hash is null) or
  (evidence is not null and evidence_hash ~ '^[a-f0-9]{64}$'))
);
create table internal_inclusion_cancellation.events (
 id bigint generated always as identity primary key,
 operation_id uuid not null references internal_inclusion_cancellation.operations(id),
 receivable_id uuid,
 event text not null,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default clock_timestamp()
);
alter table internal_inclusion_cancellation.operations enable row level security;
alter table internal_inclusion_cancellation.items enable row level security;
alter table internal_inclusion_cancellation.events enable row level security;
revoke all on all tables in schema internal_inclusion_cancellation from public,anon,authenticated,service_role;
revoke all on all sequences in schema internal_inclusion_cancellation from public,anon,authenticated,service_role;

create function internal_inclusion_cancellation.immutable()
returns trigger language plpgsql set search_path='' as $$
declare mutable text[];
begin
 if tg_op='DELETE' or tg_table_name='events' then raise exception 'INCLUSION_HISTORY_IMMUTABLE'; end if;
 if tg_table_name='operations' then
  mutable:=array['state','execution_enabled','approved_at','completed_at','finalizing_xid'];
  if old.approved_at is not null and new.approved_at is distinct from old.approved_at then
   raise exception 'INCLUSION_APPROVAL_IMMUTABLE'; end if;
 else
  mutable:=array['state','lease_token','lease_until','intent_at','review_reason','attempts',
   'evidence','evidence_hash','completed_at','post_receivable_snapshot','post_transaction_snapshot','last_dispatch_at'];
  if (old.intent_at is not null and new.intent_at is distinct from old.intent_at)
   or (old.evidence is not null and new.evidence is distinct from old.evidence)
   or (old.completed_at is not null and new.completed_at is distinct from old.completed_at)
   or (old.post_receivable_snapshot is not null and new.post_receivable_snapshot is distinct from old.post_receivable_snapshot)
   or (old.post_transaction_snapshot is not null and new.post_transaction_snapshot is distinct from old.post_transaction_snapshot)
  then raise exception 'INCLUSION_EVIDENCE_IMMUTABLE'; end if;
 end if;
 if (to_jsonb(old)-mutable) is distinct from (to_jsonb(new)-mutable) then
  raise exception 'INCLUSION_SNAPSHOT_IMMUTABLE'; end if;
 return new;
end $$;
create trigger immutable_operation before update or delete on internal_inclusion_cancellation.operations
 for each row execute function internal_inclusion_cancellation.immutable();
create trigger immutable_item before update or delete on internal_inclusion_cancellation.items
 for each row execute function internal_inclusion_cancellation.immutable();
create trigger immutable_event before update or delete on internal_inclusion_cancellation.events
 for each row execute function internal_inclusion_cancellation.immutable();
create function internal_inclusion_cancellation.hash(p_text text)
returns text language sql immutable strict set search_path='' as $$
 select encode(extensions.digest(convert_to(p_text,'UTF8'),'sha256'),'hex');
$$;
create function internal_inclusion_cancellation.manifest(p_id uuid)
returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('operationId',id,'purpose',purpose,'state',state,
  'canonicalText',canonical_text,'fingerprint',fingerprint,
  'items',canonical_text::jsonb->'items','planFingerprint',plan_fingerprint)
 from internal_inclusion_cancellation.operations where id=p_id;
$$;
create function internal_inclusion_cancellation.source(p_receivable_id uuid,p_completed boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare title jsonb; a jsonb; r public.contas_receber%rowtype;
begin
 title:=internal_financial_correction.inspect_title(p_receivable_id,p_completed);
 select * into strict r from public.contas_receber where id=p_receivable_id;
 perform internal_academic.assert_manual_cycle_reviewed_receivable(r);
 select to_jsonb(x) into a from internal_academic.technical_manual_receivable_issuance_authorizations x
  where receivable_id=p_receivable_id for share;
 if a is null or a->>'first_claimed_at' is null or coalesce((a->>'claim_count')::integer,0)<1
  or a->>'matricula_id' is distinct from r.matricula_id::text
  or a->>'turma_id' is distinct from r.turma_id::text
  or internal_academic.technical_manual_banese_expected_terms(r) is distinct from r.gateway_financial_terms
 then raise exception 'INCLUSION_SOURCE_AUTH_OR_TERMS'; end if;
 -- Fingerprint is checked only on the original open state; cancellation changes status.
 if not p_completed and a->>'receivable_fingerprint' is distinct from
   internal_academic.technical_manual_receivable_issuance_fingerprint(r)
 then raise exception 'INCLUSION_SOURCE_AUTH_FINGERPRINT'; end if;
 return title||jsonb_build_object('authorization',a);
end $$;

-- Maintenance-only capability, no grants. Owner chat evidence is immutable;
-- no application auth.uid or source-run author is impersonated as the approver.
create function internal_inclusion_cancellation.prepare_operation(
 p_operation_id uuid,p_matricula_id uuid,p_cycle_number integer,
 p_cycle_request_id uuid,p_receivable_ids uuid[],p_reason text,p_approval_reference text,p_approval_hash text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 m public.matriculas%rowtype; run internal_academic.technical_manual_cycle_runs%rowtype;
 o internal_inclusion_cancellation.operations%rowtype; ids uuid[]; run_ids uuid[];
 polo uuid; title jsonb; titles jsonb:='[]'; identities jsonb:='[]'; manifest_text text;
 plan_text text; rid uuid; pos integer:=0;
begin
 select * into m from public.matriculas where id=p_matricula_id;
 select polo_id into polo from public.turmas where id=m.turma_id;
 if m.id is null or polo is null then raise exception 'INCLUSION_SCOPE_NOT_FOUND'; end if;
 if p_operation_id is null or p_cycle_request_id is null or p_cycle_number not in(1,2)
  or coalesce(cardinality(p_receivable_ids),0) not between 1 and 100
  or array_position(p_receivable_ids,null) is not null
  or coalesce(length(p_reason),0) not between 10 and 1000
  or coalesce(length(p_approval_reference),0) not between 8 and 512
  or coalesce(p_approval_hash,'') !~ '^[a-f0-9]{64}$' then raise exception 'INCLUSION_PREPARE_INPUT'; end if;
 select array_agg(distinct x order by x) into ids from unnest(p_receivable_ids) x;
 if cardinality(ids)<>cardinality(p_receivable_ids) then raise exception 'INCLUSION_DUPLICATE_IDS'; end if;
 perform pg_advisory_xact_lock(hashtextextended('inclusion-cancel:'||p_matricula_id::text,0));
 select * into o from internal_inclusion_cancellation.operations where id=p_operation_id for update;
 if found then
  if o.matricula_id is distinct from p_matricula_id
   or o.cycle_number is distinct from p_cycle_number or o.cycle_request_id is distinct from p_cycle_request_id
   or o.reason is distinct from p_reason or o.approval_reference is distinct from p_approval_reference
   or o.approval_hash is distinct from p_approval_hash
   or ids is distinct from (select array_agg(receivable_id order by receivable_id)
      from internal_inclusion_cancellation.items where operation_id=o.id)
  then raise exception 'INCLUSION_IDEMPOTENCY_CONFLICT'; end if;
  return internal_inclusion_cancellation.manifest(o.id);
 end if;
 select * into strict run from internal_academic.technical_manual_cycle_runs
  where matricula_id=p_matricula_id and cycle_number=p_cycle_number for share;
 select * into strict m from public.matriculas where id=p_matricula_id for share;
 select array_agg(x order by x) into run_ids from unnest(run.receivable_ids) x;
 if run.request_id is distinct from p_cycle_request_id or run.state is distinct from 'LOCAL_CREATED'
  or run.turma_id is distinct from m.turma_id or run.created_by is null or run.reviewed_items is null
  or run.item_count is distinct from cardinality(ids) or run_ids is distinct from ids
 then raise exception 'INCLUSION_EXACT_NATIVE_RUN_REQUIRED'; end if;
 foreach rid in array ids loop
  if exists(select 1 from internal_financial_correction.items where receivable_id=rid)
   or (select count(*) from internal_academic.technical_manual_cycle_runs where rid=any(receivable_ids))<>1
  then raise exception 'INCLUSION_OTHER_OPERATION_OR_RUN'; end if;
  title:=internal_inclusion_cancellation.source(rid);
  if title#>>'{identity,enrollmentId}' is distinct from m.id::text
   or title#>>'{identity,classId}' is distinct from m.turma_id::text
   or title->>'poloId' is distinct from polo::text
   or title#>>'{authorization,cycle_number}' is distinct from run.cycle_number::text
   or title#>>'{authorization,authorized_by}' is distinct from run.created_by::text
   or title#>>'{transaction,raw_payload,manualCycleIssuance,cycleRequestId}' is distinct from run.request_id::text
  then raise exception 'INCLUSION_SOURCE_RUN_IDENTITY'; end if;
  titles:=titles||jsonb_build_array(title); identities:=identities||jsonb_build_array(title->'identity');
 end loop;
 manifest_text:=jsonb_build_object('operationId',p_operation_id,
  'purpose','FINANCIAL_CORRECTION_CANCEL_ONLY','items',identities)::text;
 plan_text:=jsonb_build_object('manifest',manifest_text,'executionActorKind','SYSTEM_MAINTENANCE','requesterChannel','CHAT_OWNER','reason',p_reason,
  'approvalReference',p_approval_reference,'approvalHash',p_approval_hash,
  'run',to_jsonb(run),'enrollment',to_jsonb(m),'sources',titles)::text;
 insert into internal_inclusion_cancellation.operations(id,matricula_id,turma_id,polo_id,
  cycle_number,cycle_request_id,approval_reference,approval_hash,reason,run_snapshot,enrollment_snapshot,
  canonical_text,fingerprint,plan,plan_fingerprint,item_count)
 values(p_operation_id,m.id,m.turma_id,polo,p_cycle_number,p_cycle_request_id,
  p_approval_reference,p_approval_hash,p_reason,to_jsonb(run),to_jsonb(m),manifest_text,
  internal_inclusion_cancellation.hash(manifest_text),plan_text::jsonb,internal_inclusion_cancellation.hash(plan_text),cardinality(ids));
 for title in select value from jsonb_array_elements(titles) loop
  pos:=pos+1;
  insert into internal_inclusion_cancellation.items(operation_id,receivable_id,position,transaction_id,
   identity_snapshot,receivable_snapshot,transaction_snapshot,authorization_snapshot)
  values(p_operation_id,(title#>>'{identity,receivableId}')::uuid,pos,(title->>'transactionId')::uuid,
   title->'identity',title->'receivable',title->'transaction',title->'authorization');
 end loop;
 insert into internal_inclusion_cancellation.events(operation_id,event)
 values(p_operation_id,'PREPARED');
 return internal_inclusion_cancellation.manifest(p_operation_id);
end $$;
revoke all on all functions in schema internal_inclusion_cancellation from public,anon,authenticated,service_role;
commit;
