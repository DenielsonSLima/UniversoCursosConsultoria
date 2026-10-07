-- LOCAL REVIEW DRAFT ONLY. No runtime grants; privileges require separate approval.
begin;
create function public.load_financial_correction_service(p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i record;
begin
  perform internal_financial_correction.service_only();
  perform internal_financial_correction.assert_operation(p_operation_id);
  for i in select receivable_id from internal_financial_correction.items
    where operation_id=p_operation_id order by position loop
    perform internal_financial_correction.check_item(p_operation_id,i.receivable_id);
  end loop;
  return internal_financial_correction.manifest(p_operation_id);
end $$;

create function public.claim_financial_correction_service(
  p_operation_id uuid,p_receivable_id uuid,p_fingerprint text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o internal_financial_correction.operations%rowtype;
  i internal_financial_correction.items%rowtype;
  token uuid;
  mode_value text;
begin
  perform internal_financial_correction.service_only();
  if p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'CORRECTION_FINGERPRINT_REQUIRED';
  end if;
  o := internal_financial_correction.assert_operation(p_operation_id,p_fingerprint);
  i := internal_financial_correction.check_item(p_operation_id,p_receivable_id);
  if i.kind='LOCAL_WAIVER' then raise exception 'CORRECTION_BANK_ITEM_REQUIRED'; end if;
  if i.state in ('BANK_CONFIRMED','FINALIZED') then mode_value := 'COMPLETE'; token := i.lease_token;
  else
    if i.lease_until>clock_timestamp() then raise exception 'CORRECTION_LEASE_ACTIVE'; end if;
    token := gen_random_uuid();
    mode_value := case when i.intent_at is not null or i.state='REVIEW'
      then 'CONFIRM_ONLY' else 'CANCEL_ALLOWED' end;
    update internal_financial_correction.items set state='LEASED',lease_token=token,
      lease_until=clock_timestamp()+interval '2 minutes',attempt_count=attempt_count+1
      where operation_id=o.id and receivable_id=i.receivable_id;
    perform internal_financial_correction.audit_event(o.id,i.receivable_id,'CLAIMED',
      jsonb_build_object('mode',mode_value,'leaseToken',token));
  end if;
  return jsonb_build_object('operationId',o.id,'manifestFingerprint',o.fingerprint,
    'item',i.identity_snapshot,'leaseToken',token,'mode',mode_value);
end $$;

create function public.start_financial_correction_service(
  p_operation_id uuid,p_receivable_id uuid,p_fingerprint text,p_lease_token uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o internal_financial_correction.operations%rowtype;
  i internal_financial_correction.items%rowtype;
  guard_at timestamptz;
begin
  perform internal_financial_correction.service_only();
  if p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'CORRECTION_FINGERPRINT_REQUIRED';
  end if;
  o := internal_financial_correction.assert_operation(p_operation_id,p_fingerprint);
  i := internal_financial_correction.check_item(p_operation_id,p_receivable_id);
  if i.kind='LOCAL_WAIVER' then raise exception 'CORRECTION_BANK_ITEM_REQUIRED'; end if;
  if i.state<>'LEASED' or i.lease_token is distinct from p_lease_token
    or i.lease_until<=clock_timestamp() or i.lease_until is null
    or i.intent_at is not null or i.review_reason is not null then
    raise exception 'CORRECTION_INTENT_LEASE_OR_REPLAY';
  end if;
  -- Touch the CAS fence already used by existing bank/settlement workers.
  update public.contas_receber set updated_at=clock_timestamp()
    where id=i.receivable_id returning updated_at into guard_at;
  update internal_financial_correction.items set state='INTENT',intent_at=clock_timestamp(),
    guard_updated_at=guard_at,lease_until=clock_timestamp()+interval '10 minutes'
    where operation_id=o.id and receivable_id=i.receivable_id;
  -- Pause only this title's queue; no global worker is run or disabled.
  update public.banese_reconciliation_queue set state='DONE',next_check_at=null,
    lease_run_id=null,lease_until=null,last_result='CANCELLATION_IN_PROGRESS',updated_at=clock_timestamp()
    where receivable_id=i.receivable_id;
  perform internal_financial_correction.audit_event(o.id,i.receivable_id,'INTENT_RECORDED',
    jsonb_build_object('leaseToken',p_lease_token));
  return jsonb_build_object('started',true);
end $$;

create function public.review_financial_correction_service(
  p_operation_id uuid,p_receivable_id uuid,p_fingerprint text,p_lease_token uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o internal_financial_correction.operations%rowtype;
  i internal_financial_correction.items%rowtype;
  guard_result text := 'UNCHANGED';
  authorization_result text := 'ACTIVE';
begin
  perform internal_financial_correction.service_only();
  if p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'CORRECTION_FINGERPRINT_REQUIRED';
  end if;
  -- Audit-only recovery must remain possible after revocation/disablement.
  -- Exact immutable approval + current lease are still required; no bank or
  -- receivable mutation is authorized by this path.
  o := internal_financial_correction.assert_operation(p_operation_id,p_fingerprint,true);
  if not o.execution_enabled or exists(select 1 from internal_financial_correction.items item
    where item.operation_id=o.id and not coalesce(
      internal_financial_correction.actor_allowed(o.actor_id,item.polo_id),false)) then
    authorization_result := 'DISABLED_OR_REVOKED';
  end if;
  select * into i from internal_financial_correction.items
    where operation_id=o.id and receivable_id=p_receivable_id for update;
  if not found or i.kind='LOCAL_WAIVER' or i.lease_token is distinct from p_lease_token or i.state in ('BANK_CONFIRMED','FINALIZED')
    or p_reason is null or p_reason not in ('REMOTE_OR_GUARD_REVIEW','REMOTE_AMBIGUOUS','LOCAL_SYNC_AFTER_REMOTE')
  then raise exception 'CORRECTION_REVIEW_SCOPE'; end if;
  -- A newly paid title must still get an audit-only review marker. Never overwrite it.
  begin
    perform internal_financial_correction.check_item(o.id,i.receivable_id);
  exception when others then
    guard_result := 'LOCAL_GUARD_BLOCKED';
  end;
  update internal_financial_correction.items set state='REVIEW',review_reason=p_reason,
    lease_until=null where operation_id=o.id and receivable_id=i.receivable_id;
  perform internal_financial_correction.audit_event(o.id,i.receivable_id,'REVIEW_REQUIRED',
    jsonb_build_object('leaseToken',p_lease_token,'reason',p_reason,
      'localGuard',guard_result,'authorization',authorization_result));
  return jsonb_build_object('reviewed',true);
end $$;
revoke all on function public.load_financial_correction_service(uuid) from public,anon,authenticated,service_role;
revoke all on function public.claim_financial_correction_service(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.start_financial_correction_service(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.review_financial_correction_service(uuid,uuid,text,uuid,text) from public,anon,authenticated,service_role;
commit;
