-- Read-only: scalar fixtures, current audit rows and authenticated RPC projection.
do $recovery_labels$
declare v jsonb;
begin
  v:=internal_contas.banese_attempt_recovery_labels(true,'PENDENTE','READY','PENDING');
  assert v->>'status'='RECOVERED_AFTER_QUERY','A successful pending query did not recover the error';
  assert v->>'currentQueryLabel' like '%banco informou pendente','Pending was mistaken for a query failure';
  v:=internal_contas.banese_attempt_recovery_labels(true,'PENDENTE','READY','ERROR');
  assert v->>'status'='RECOVERED_AFTER_QUERY','Historical recovery was erased by a later failure';
  assert v->>'currentQueryLabel' like '%falhou','A newer query failure was hidden';
  v:=internal_contas.banese_attempt_recovery_labels(false,'PAGO','DONE','ERROR');
  assert v->>'status'='SETTLED_CURRENT','Paid queue state was ignored';
  assert v->>'label' like '%sem nova consulta comprovada','Payment fabricated a successful GET';
  assert v->>'currentQueryLabel' like '%falhou','A paid title hid the failed query';
  v:=internal_contas.banese_attempt_recovery_labels(false,'PENDENTE','READY','ERROR');
  assert v->>'status'='AWAITING_NEW_QUERY','An unresolved failure was marked recovered';
  v:=internal_contas.banese_attempt_recovery_labels(false,'CANCELADO','DONE',null);
  assert v->>'status'='TERMINAL_CURRENT','Cancellation fabricated a recovery';
  assert not has_function_privilege('authenticated',
    'internal_contas.banese_attempt_recovery_labels(boolean,text,text,text)','execute'),
    'Private observation helper exposed';
end;
$recovery_labels$;

do $recovery_feed$
declare
  v_saved_claims text:=current_setting('request.jwt.claims',true);
  v_saved_role text:=current_setting('request.jwt.claim.role',true);
  v_saved_sub text:=current_setting('request.jwt.claim.sub',true);
  v_actor uuid;
  v_email text;
  v_environment text;
  v_count bigint;
  v_today_errors bigint;
  v_page jsonb;
  v_next jsonb;
  v_item jsonb;
  v_event public.banese_reconciliation_attempts;
  v_latest public.banese_reconciliation_attempts;
  v_success timestamptz;
  v_queue public.banese_reconciliation_queue;
  v_current_status text;
begin
  select a.id,a.email into strict v_actor,v_email from internal_proesc.connection connection
  join public.usuarios_sistema u on u.id=connection.updated_by
  join auth.users a on lower(btrim(a.email))=lower(btrim(u.email))
  where lower(u.status)='ativo' limit 1;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  begin
    perform public.get_banese_reconciliation_attempts_page('errors',1,20);
    raise exception 'An unidentified actor read the historical feed';
  exception when sqlstate '42501' then null; end;
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_actor,'email',v_email)::text,true);
  assert public.gestor_has_module('financeiro') and public.gestor_has_financeiro_tab('receber'),
    'Test operator must have financial-detail permission';
  select coalesce(active_environment,'sandbox') into strict v_environment
    from public.payment_gateway_runtime_config limit 1;
  select count(*),count(*) filter(where (created_at at time zone 'America/Maceio')::date
    =(now() at time zone 'America/Maceio')::date)
  into v_count,v_today_errors from public.banese_reconciliation_attempts
  where environment=v_environment and result in ('ERROR','THROTTLED');
  v_page:=public.get_banese_reconciliation_attempts_page('errors',1,20);
  v_next:=public.get_banese_reconciliation_attempts_page('errors',2,20);
  assert (v_page->>'totalCount')::bigint=v_count,'Historical events were deleted or recounted as titles';
  if v_today_errors=0 and v_count>0 then
    assert (v_page->>'totalCount')::bigint>0,'A healthy day erased historical errors';
  end if;
  assert not exists(select 1 from jsonb_array_elements(v_page->'items') a
    join jsonb_array_elements(v_next->'items') b on a->>'id'=b->>'id'),'Error pages overlap';
  for v_item in select value from jsonb_array_elements(v_page->'items') loop
    select * into strict v_event from public.banese_reconciliation_attempts where id=(v_item->>'id')::bigint;
    select * into strict v_latest from public.banese_reconciliation_attempts
      where receivable_id=v_event.receivable_id and environment=v_environment
      order by created_at desc,id desc limit 1;
    select created_at into v_success from public.banese_reconciliation_attempts
      where receivable_id=v_event.receivable_id and environment=v_environment
        and result in ('PENDING','PAID') and (created_at,id)>(v_event.created_at,v_event.id)
      order by created_at,id limit 1;
    select * into v_queue from public.banese_reconciliation_queue
      where receivable_id=v_event.receivable_id and environment=v_environment;
    select status into v_current_status from public.contas_receber where id=v_event.receivable_id;
    assert v_item->>'result'=v_event.result and v_item->>'error_class' is not distinct from v_event.error_class,
      'The original error was overwritten';
    assert (v_item#>>'{recovery,recoveredAt}')::timestamptz is not distinct from v_success,
      'Recovery lacks an exact later success from the same title/environment';
    assert v_item#>>'{recovery,latestQueryResult}'=v_latest.result,'Latest query is stale';
    assert (v_item#>>'{recovery,latestQueryAt}')::timestamptz=v_latest.created_at,'Latest timestamp differs';
    assert v_item#>>'{recovery,queueState}' is not distinct from v_queue.state,'Queue projection differs';
    assert v_item#>>'{recovery,status}'=(internal_contas.banese_attempt_recovery_labels(
      v_success is not null,v_current_status,v_queue.state,v_latest.result)->>'status'),
      'Historical resolution differs from canonical evidence';
  end loop;
  v_page:=public.get_banese_reconciliation_attempts_page('errors',214748,20);
  assert jsonb_array_length(v_page->'items')=0,'Empty page should stay empty';
  perform set_config('request.jwt.claims',coalesce(v_saved_claims,''),true);
  perform set_config('request.jwt.claim.role',coalesce(v_saved_role,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(v_saved_sub,''),true);
  raise notice 'Historical recovery, current query, permissions and pagination passed; today errors %, historical events %',
    v_today_errors,v_count;
end;
$recovery_feed$;
