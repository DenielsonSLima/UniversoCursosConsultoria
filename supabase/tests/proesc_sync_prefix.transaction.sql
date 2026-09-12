-- Private rollback-only cursor contract. No authorize secret, enqueue, HTTP,
-- receipt, payment, or enrollment operation is executed by this test.
do $sync_prefix_contract$
declare
  v_actor uuid;
  v_links uuid[];
  v_lease uuid;
  v_before jsonb;
  v_after jsonb;
  v_response jsonb;
  v_invalid jsonb;
  v_claims text:=current_setting('request.jwt.claims',true);
begin
  select to_jsonb(runtime) into strict v_before from internal_proesc.sync_runtime runtime where id for update;
  begin
    perform set_config('request.jwt.claims','{"role":"service_role"}',true);
    select updated_by into strict v_actor from internal_proesc.connection where id;
    select array_agg(id order by id) into v_links from (
      select id from internal_proesc.obligation_links order by id limit 3
    ) links;
    assert cardinality(v_links)=3,'Three existing source links are required for the lease fixture';
    v_lease:=gen_random_uuid();
    update internal_proesc.sync_runtime set lease_id=v_lease,lease_links=v_links,
      lease_last_id=v_links[3],lease_until=now()+interval '3 minutes',cursor_id=null where id;
    begin
      perform public.proesc_sync_runtime_service('finish',v_actor,jsonb_build_object(
        'leaseId',v_lease,'lastId',v_links[3],'success',false,'counts','{}'::jsonb,
        'completedCount',2,'completedLastId',v_links[3]));
      raise exception 'Cursor accepted a gap in the completed prefix';
    exception when sqlstate '22023' then null; end;
    begin
      perform public.proesc_sync_runtime_service('finish',v_actor,jsonb_build_object(
        'leaseId',v_lease,'lastId',v_links[3],'success',true,'counts','{}'::jsonb,
        'completedCount',1,'completedLastId',v_links[1]));
      raise exception 'Partial completion claimed full success';
    exception when sqlstate '22023' then null; end;
    for v_invalid in select value from jsonb_array_elements('[
      {"completedCount":-1,"completedLastId":null},
      {"completedCount":1.5,"completedLastId":null},
      {"completedCount":null,"completedLastId":null},
      {"completedCount":61,"completedLastId":null},
      {"completedCount":0}
    ]'::jsonb) loop
      begin
        perform public.proesc_sync_runtime_service('finish',v_actor,
          jsonb_build_object('leaseId',v_lease,'lastId',v_links[3],
            'success',false,'counts','{}'::jsonb)||v_invalid);
        raise exception 'Invalid prefix report accepted';
      exception when sqlstate '22023' then null; end;
    end loop;
    v_response:=public.proesc_sync_runtime_service('finish',v_actor,jsonb_build_object(
      'leaseId',v_lease,'lastId',v_links[3],'success',false,'counts','{"failed":1}'::jsonb,
      'completedCount',1,'completedLastId',v_links[1]));
    assert v_response->'finished'='true'::jsonb,'Partial finish was rejected';
    assert (select cursor_id=v_links[1] and lease_id is null from internal_proesc.sync_runtime where id),
      'Partial finish did not advance exactly the completed prefix';
    v_lease:=gen_random_uuid();
    update internal_proesc.sync_runtime set lease_id=v_lease,lease_links=v_links,
      lease_last_id=v_links[3],lease_until=now()+interval '3 minutes' where id;
    perform public.proesc_sync_runtime_service('finish',v_actor,jsonb_build_object(
      'leaseId',v_lease,'lastId',v_links[3],'success',false,'counts','{}'::jsonb,
      'completedCount',0,'completedLastId',null));
    assert (select cursor_id=v_links[1] from internal_proesc.sync_runtime where id),
      'An empty prefix moved the cursor';
    v_lease:=gen_random_uuid();
    update internal_proesc.sync_runtime set lease_id=v_lease,lease_links=v_links,
      lease_last_id=v_links[3],lease_until=now()+interval '3 minutes' where id;
    perform public.proesc_sync_runtime_service('finish',v_actor,jsonb_build_object(
      'leaseId',v_lease,'lastId',v_links[3],'success',true,'counts','{}'::jsonb));
    assert (select cursor_id=v_links[3] from internal_proesc.sync_runtime where id),
      'Previous worker finish contract stopped working';
    raise exception 'rollback prefix fixture' using errcode='PT999';
  exception when sqlstate 'PT999' then null; end;
  select to_jsonb(runtime) into strict v_after from internal_proesc.sync_runtime runtime where id for update;
  assert v_before=v_after,'Cursor fixture changed the live worker state';
  perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
  raise notice 'Partial/full/empty prefix, gap rejection and backward compatibility passed';
end;
$sync_prefix_contract$;
