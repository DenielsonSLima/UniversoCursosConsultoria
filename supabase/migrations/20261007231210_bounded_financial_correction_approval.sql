-- LOCAL DRAFT: private full-plan preparation and approval. No runtime grants.
begin;
create function internal_financial_correction.manifest(p_operation_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('operationId',o.id,'fingerprint',o.fingerprint,
    'canonicalText',o.canonical_text,'purpose',o.purpose,
    'state',case when o.state in ('BANK_CONFIRMED','FINALIZED') then 'COMPLETE' else o.state end,
    'items',o.canonical_text::jsonb->'items','planFingerprint',o.plan_fingerprint)
  from internal_financial_correction.operations o where o.id=p_operation_id;
$$;
create function internal_financial_correction.prepare_operation(
  p_operation_id uuid,p_actor_id uuid,p_bank_receivable_ids uuid[],p_local_fee_ids uuid[],
  p_approval_reference text,p_approval_hash text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  bank_ids uuid[]; local_ids uuid[]; all_ids uuid[]; rid uuid;
  title jsonb; titles jsonb := '[]'::jsonb; identities jsonb := '[]'::jsonb;
  manifest_text text; plan_value jsonb; class_id uuid; polo uuid; index_value integer := 0;
  existing internal_financial_correction.operations%rowtype;
begin
  if p_operation_id is null or p_actor_id is null
    or coalesce(cardinality(p_bank_receivable_ids),0)<>49 or coalesce(cardinality(p_local_fee_ids),0)<>5
    or array_position(p_bank_receivable_ids,null) is not null
    or array_position(p_local_fee_ids,null) is not null
    or p_approval_reference is null or length(p_approval_reference) not between 8 and 512
    or coalesce(p_approval_hash,'') !~ '^[a-f0-9]{64}$' then raise exception 'CORRECTION_APPROVAL_INPUT'; end if;
  select array_agg(distinct x order by x) into bank_ids from unnest(p_bank_receivable_ids) x;
  select array_agg(distinct x order by x) into local_ids from unnest(p_local_fee_ids) x;
  if cardinality(bank_ids)<>49 or cardinality(local_ids)<>5 or bank_ids && local_ids then
    raise exception 'CORRECTION_DUPLICATE_ITEM'; end if;
  all_ids := bank_ids||local_ids;
  -- Exact scope authorization precedes operation/replay lookup.
  foreach rid in array all_ids loop
    if not exists(select 1 from public.contas_receber r where r.id=rid
      and internal_financial_correction.actor_allowed(p_actor_id,r.polo_id)) then
      raise exception 'CORRECTION_ACTOR_SCOPE' using errcode='42501'; end if;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
  select * into existing from internal_financial_correction.operations where id=p_operation_id for update;
  if found then
    if existing.actor_id is distinct from p_actor_id or existing.approval_reference is distinct from p_approval_reference
      or existing.approval_evidence_hash is distinct from p_approval_hash
      or bank_ids is distinct from (select array_agg(receivable_id order by receivable_id)
        from internal_financial_correction.items where operation_id=p_operation_id and kind<>'LOCAL_WAIVER')
      or local_ids is distinct from (select array_agg(receivable_id order by receivable_id)
        from internal_financial_correction.items where operation_id=p_operation_id and kind='LOCAL_WAIVER')
    then raise exception 'CORRECTION_IDEMPOTENCY_CONFLICT'; end if;
    return internal_financial_correction.manifest(p_operation_id);
  end if;
  -- Deterministically acquire all source-run locks before any receivable lock.
  perform 1 from internal_academic.technical_manual_cycle_runs r
    where r.receivable_ids && all_ids order by r.matricula_id,r.cycle_number for share;
  foreach rid in array all_ids loop
    title := internal_financial_correction.inspect_source(rid,rid=any(local_ids));
    titles := titles || jsonb_build_array(title);
    if rid=any(bank_ids) then identities := identities||jsonb_build_array(title->'identity'); end if;
  end loop;
  select (x#>>'{receivable,turma_id}')::uuid,(x->>'poloId')::uuid into class_id,polo
    from jsonb_array_elements(titles) x limit 1;
  if exists(select 1 from jsonb_array_elements(titles) x
      where x#>>'{receivable,turma_id}' is distinct from class_id::text
        or x->>'poloId' is distinct from polo::text)
    or (select count(*) from jsonb_array_elements(titles) x where x->>'kind'='RESET_C1')<>36
    or (select count(distinct x#>>'{receivable,matricula_id}') from jsonb_array_elements(titles) x
      where x->>'kind'='RESET_C1')<>3
    or exists(select 1 from jsonb_array_elements(titles) x where x->>'kind'='RESET_C1'
      group by x#>>'{receivable,matricula_id}' having count(*)<>12
        or count(distinct x#>>'{receivable,parcela_numero}')<>12)
    or (select count(*) from jsonb_array_elements(titles) x where x->>'kind'='CANCEL_C2')<>13
    or (select count(distinct x#>>'{receivable,matricula_id}') from jsonb_array_elements(titles) x
      where x->>'kind'='CANCEL_C2')<>1
    or (select count(*) from jsonb_array_elements(titles) x where x->>'kind'='CANCEL_C2'
      and x#>>'{receivable,tipo_lancamento}'='REMATRICULA')<>1
    or (select count(distinct x#>>'{receivable,parcela_numero}') from jsonb_array_elements(titles) x
      where x->>'kind'='CANCEL_C2' and x#>>'{receivable,tipo_lancamento}'='PARCELA')<>12
  then raise exception 'CORRECTION_EXACT_49_AND_5_SHAPE'; end if;
  manifest_text := jsonb_build_object('operationId',p_operation_id,
    'purpose','FINANCIAL_CORRECTION_CANCEL_ONLY','items',identities)::text;
  -- Full plan binds all source snapshots, dispositions, original/corrected canonical terms,
  -- and approval evidence. Bank fingerprint deliberately stays processor-compatible.
  plan_value := jsonb_build_object('operationId',p_operation_id,'actorId',p_actor_id,
    'classId',class_id,'poloId',polo,'bankFingerprint',internal_financial_correction.sha256(manifest_text),
    'approvalHash',p_approval_hash,'items',titles);
  insert into internal_financial_correction.operations(id,purpose,actor_id,approval_source,
    approval_reference,approval_evidence_hash,canonical_text,fingerprint,turma_id,polo_id,plan,plan_fingerprint)
  values(p_operation_id,'FINANCIAL_CORRECTION_CANCEL_ONLY',p_actor_id,'EXPLICIT_OWNER_APPROVAL',
    p_approval_reference,p_approval_hash,manifest_text,internal_financial_correction.sha256(manifest_text),
    class_id,polo,plan_value,internal_financial_correction.sha256(plan_value::text));
  for title in select value from jsonb_array_elements(titles) loop
    index_value := index_value+1;
    insert into internal_financial_correction.items(operation_id,receivable_id,kind,matricula_id,cycle_number,
      position,polo_id,transaction_id,identity_snapshot,receivable_snapshot,transaction_snapshot,
      run_snapshot,authorization_snapshot,corrected_due_date,corrected_terms,guard_updated_at,
      guard_gateway_synced_at,guard_transaction_updated_at,guard_transaction_synced_at)
    values(p_operation_id,(title#>>'{receivable,id}')::uuid,title->>'kind',
      (title#>>'{receivable,matricula_id}')::uuid,(title#>>'{run,cycle_number}')::integer,
      index_value,(title->>'poloId')::uuid,(title->>'transactionId')::uuid,title->'identity',
      title->'receivable',title->'transaction',title->'run',nullif(title->'authorization','null'::jsonb),
      (title->>'correctedDueDate')::date,nullif(title->'correctedTerms','null'::jsonb),
      (title#>>'{receivable,updated_at}')::timestamptz,(title#>>'{receivable,gateway_synced_at}')::timestamptz,
      (title#>>'{transaction,updated_at}')::timestamptz,(title#>>'{transaction,synced_at}')::timestamptz);
    perform internal_financial_correction.audit_event(p_operation_id,(title#>>'{receivable,id}')::uuid,'PREPARED');
  end loop;
  return internal_financial_correction.manifest(p_operation_id);
end $$;

create function internal_financial_correction.assert_operation(
  p_operation_id uuid,p_fingerprint text default null,p_audit_only boolean default false
) returns internal_financial_correction.operations
language plpgsql security definer set search_path = '' as $$
declare o internal_financial_correction.operations%rowtype;
begin
  select * into o from internal_financial_correction.operations where id=p_operation_id for update;
  if not found or (not o.execution_enabled and not p_audit_only)
    or o.state not in ('APPROVED','BANK_CONFIRMED','FINALIZED') or o.approved_at is null
    or o.approval_source<>'EXPLICIT_OWNER_APPROVAL' then
    raise exception 'CORRECTION_OPERATION_NOT_APPROVED' using errcode='42501'; end if;
  if not p_audit_only and not coalesce(internal_financial_correction.actor_allowed(o.actor_id,o.polo_id),false)
  then raise exception 'CORRECTION_ACTOR_SCOPE' using errcode='42501'; end if;
  perform 1 from internal_academic.technical_manual_cycle_runs r where exists(
    select 1 from internal_financial_correction.items item where item.operation_id=o.id
      and item.receivable_id=any(r.receivable_ids)) order by r.matricula_id,r.cycle_number for share;
  if o.fingerprint is distinct from internal_financial_correction.sha256(o.canonical_text)
    or o.plan_fingerprint is distinct from internal_financial_correction.sha256(o.plan::text)
    or (p_fingerprint is not null and p_fingerprint is distinct from o.fingerprint)
    or (select count(*) from internal_financial_correction.items where operation_id=o.id)<>54
    or (select count(*) from internal_financial_correction.items where operation_id=o.id and kind='RESET_C1')<>36
    or (select count(*) from internal_financial_correction.items where operation_id=o.id and kind='CANCEL_C2')<>13
    or (select count(*) from internal_financial_correction.items where operation_id=o.id and kind='LOCAL_WAIVER')<>5
    or (select jsonb_agg(identity_snapshot order by position) from internal_financial_correction.items
      where operation_id=o.id and kind<>'LOCAL_WAIVER') is distinct from o.canonical_text::jsonb->'items'
    or o.canonical_text::jsonb->>'operationId' is distinct from o.id::text
    or o.canonical_text::jsonb->>'purpose' is distinct from o.purpose
    or o.plan->>'bankFingerprint' is distinct from o.fingerprint
    or exists(select 1 from internal_financial_correction.items i
      left join lateral (select x from jsonb_array_elements(o.plan->'items') x
        where x#>>'{receivable,id}'=i.receivable_id::text) p on true
      where i.operation_id=o.id and (p.x is null or p.x->>'kind' is distinct from i.kind
        or p.x->'receivable' is distinct from i.receivable_snapshot
        or p.x->'transaction' is distinct from i.transaction_snapshot
        or p.x->'run' is distinct from i.run_snapshot
        or nullif(p.x->'authorization','null'::jsonb) is distinct from i.authorization_snapshot
        or nullif(p.x->'correctedTerms','null'::jsonb) is distinct from i.corrected_terms
        or (p.x->>'correctedDueDate')::date is distinct from i.corrected_due_date))
  then raise exception 'CORRECTION_MANIFEST_CHANGED'; end if;
  return o;
end $$;

create function internal_financial_correction.check_item(p_operation_id uuid,p_receivable_id uuid)
returns internal_financial_correction.items language plpgsql security definer set search_path = '' as $$
declare i internal_financial_correction.items%rowtype; title jsonb;
begin
  -- Source runs precede items, receipts, authorizations, transactions and queues.
  perform 1 from internal_academic.technical_manual_cycle_runs r where exists(
    select 1 from internal_financial_correction.items item where item.operation_id=p_operation_id
      and item.receivable_id=any(r.receivable_ids)) order by r.matricula_id,r.cycle_number for share;
  select * into i from internal_financial_correction.items
    where operation_id=p_operation_id and receivable_id=p_receivable_id for update;
  if not found then raise exception 'CORRECTION_ITEM_OUTSIDE_MANIFEST'; end if;
  if i.state in ('BANK_CONFIRMED','FINALIZED') and i.kind<>'LOCAL_WAIVER' then
    if i.bank_evidence is null or i.bank_evidence_hash is distinct from
      internal_financial_correction.sha256(i.bank_evidence::text)
    then raise exception 'CORRECTION_BANK_EVIDENCE_CHANGED'; end if;
  end if;
  -- A finalized item cannot make a bank call. The separate finalizer verifies its
  -- archived/reset projection; bank load/claim return COMPLETE without replaying it.
  if i.state='FINALIZED' then return i; end if;
  title := internal_financial_correction.inspect_source(i.receivable_id,i.kind='LOCAL_WAIVER');
  if title->'run' is distinct from i.run_snapshot
    or nullif(title->'authorization','null'::jsonb) is distinct from i.authorization_snapshot
    or title->'identity' is distinct from i.identity_snapshot
    or title->>'poloId' is distinct from i.polo_id::text
    or title->>'transactionId' is distinct from i.transaction_id::text
    or title->>'kind' is distinct from i.kind
    or nullif(title->'correctedTerms','null'::jsonb) is distinct from i.corrected_terms
    or (title->>'correctedDueDate')::date is distinct from i.corrected_due_date
  then raise exception 'CORRECTION_SNAPSHOT_IDENTITY_CHANGED'; end if;
  if ((title->'receivable')-array['updated_at','gateway_synced_at']) is distinct from
      (i.receivable_snapshot-array['updated_at','gateway_synced_at'])
    or ((title->'transaction')-array['updated_at','synced_at']) is distinct from
      (i.transaction_snapshot-array['updated_at','synced_at']) then
    raise exception 'CORRECTION_SNAPSHOT_CHANGED'; end if;
  if (i.intent_at is not null or i.state='BANK_CONFIRMED') and (
    (title#>>'{receivable,updated_at}')::timestamptz is distinct from i.guard_updated_at
    or (title#>>'{receivable,gateway_synced_at}')::timestamptz is distinct from i.guard_gateway_synced_at
    or (title#>>'{transaction,updated_at}')::timestamptz is distinct from i.guard_transaction_updated_at
    or (title#>>'{transaction,synced_at}')::timestamptz is distinct from i.guard_transaction_synced_at
  ) then raise exception 'CORRECTION_POST_INTENT_CAS_CHANGED'; end if;
  if i.intent_at is null and i.state not in ('BANK_CONFIRMED','FINALIZED') then
    update internal_financial_correction.items set
      guard_updated_at=(title#>>'{receivable,updated_at}')::timestamptz,
      guard_gateway_synced_at=(title#>>'{receivable,gateway_synced_at}')::timestamptz,
      guard_transaction_updated_at=(title#>>'{transaction,updated_at}')::timestamptz,
      guard_transaction_synced_at=(title#>>'{transaction,synced_at}')::timestamptz
    where operation_id=i.operation_id and receivable_id=i.receivable_id returning * into i;
  end if;
  return i;
end $$;

create function internal_financial_correction.approve_operation(p_operation_id uuid,p_expected_fingerprint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o internal_financial_correction.operations%rowtype; item_row record;
begin
  select * into o from internal_financial_correction.operations where id=p_operation_id for update;
  if not found or not coalesce(internal_financial_correction.actor_allowed(o.actor_id,o.polo_id),false)
    then raise exception 'CORRECTION_ACTOR_SCOPE' using errcode='42501'; end if;
  if o.plan_fingerprint is distinct from p_expected_fingerprint
    or o.plan_fingerprint is distinct from internal_financial_correction.sha256(o.plan::text)
  then raise exception 'CORRECTION_FULL_PLAN_APPROVAL_FINGERPRINT'; end if;
  perform 1 from internal_academic.technical_manual_cycle_runs r where exists(
    select 1 from internal_financial_correction.items i where i.operation_id=o.id
      and i.receivable_id=any(r.receivable_ids)) order by r.matricula_id,r.cycle_number for share;
  for item_row in select * from internal_financial_correction.items where operation_id=o.id order by position loop
    perform internal_financial_correction.check_item(o.id,item_row.receivable_id);
  end loop;
  if o.state='PREPARED' then
    update public.banese_reconciliation_queue q set state='DONE',next_check_at=null,
      lease_run_id=null,lease_until=null,last_result='CANCELLATION_IN_PROGRESS',updated_at=clock_timestamp()
      where exists(select 1 from internal_financial_correction.items i
        where i.operation_id=o.id and i.kind<>'LOCAL_WAIVER' and i.receivable_id=q.receivable_id);
    update internal_financial_correction.operations set state='APPROVED',execution_enabled=true,
      approved_at=clock_timestamp() where id=o.id;
    for item_row in select * from internal_financial_correction.items where operation_id=o.id order by position loop
      perform internal_financial_correction.audit_event(o.id,item_row.receivable_id,'APPROVED');
    end loop;
  end if;
  perform internal_financial_correction.assert_operation(o.id);
  return internal_financial_correction.manifest(o.id);
end $$;
revoke all on all functions in schema internal_financial_correction from public,anon,authenticated,service_role;
commit;
