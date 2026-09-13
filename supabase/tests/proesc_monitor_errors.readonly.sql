-- Run this file alone through MCP. Stop on timeout; do not concatenate units.
-- Read-only transaction, real Auth identity, no external API or financial writes.
begin read only;
set local statement_timeout='3s';
do $monitor_check$
declare
  v_actor uuid; v_email text;
  v_started timestamptz:=clock_timestamp(); v_duration_ms numeric;
  v_page jsonb; v_item jsonb;
begin
  select a.id,a.email into strict v_actor,v_email from internal_proesc.connection c
  join public.usuarios_sistema u on u.id=c.updated_by
  join auth.users a on lower(btrim(a.email))=lower(btrim(u.email))
  where lower(u.status)='ativo' limit 1;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'role','authenticated','sub',v_actor,'email',v_email)::text,true);
  v_started:=clock_timestamp();
  v_page:=public.get_proesc_reconciliation_feed_page(p_context=>'errors',p_page_size=>10);
  v_duration_ms:=round(extract(epoch from clock_timestamp()-v_started)*1000);
  assert (v_page->>'totalPages')::integer=greatest(1,ceil((v_page->>'totalCount')::numeric/10)::integer),
    'Incorrect total-page contract';
  assert (v_page->>'page')::integer=1 and jsonb_array_length(v_page->'items')<=10,
    'Feed pagination is unbounded';
  assert not exists(select 1 from jsonb_array_elements(v_page->'items') item
    group by item->>'id' having count(*)>1),'Duplicate IDs in one page';
  for v_item in select value from jsonb_array_elements(v_page->'items') loop
    assert not v_item ?| array['token','url','body','headers','rawResponse','accounting_lines',
      'before_state','after_state','request_payload','personHash'],
      'Feed leaked protected raw data';
    if not (v_page->>'canViewReceivableDetails')::boolean then
      assert not v_item ?| array['receivableId','principalAmount','receivedAmount','paymentDate',
        'studentName','description','externalKey'],'Financial fields exposed without permission';
    end if;
    assert v_item->>'errorMessage'=internal_proesc.sync_error_message(v_item->>'errorCode'),
      'Error message is not from the safe allowlist';
  end loop;
  perform set_config('app.proesc_monitor_test_result',jsonb_build_object('unit','proesc_monitor_errors.readonly','passed',true,'durationMs',coalesce(v_duration_ms,round(extract(epoch from clock_timestamp()-v_started)*1000)))::text,true);
end;
$monitor_check$;
select current_setting('app.proesc_monitor_test_result',true)::jsonb as test_result;
rollback;
