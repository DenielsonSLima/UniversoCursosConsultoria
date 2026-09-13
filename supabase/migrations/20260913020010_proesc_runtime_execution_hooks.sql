begin;
do $instrument_runtime$
declare v_definition text; v_before text;
begin
  v_definition:=pg_get_functiondef('public.proesc_sync_runtime_service(text,uuid,jsonb)'::regprocedure);
  v_before:=$needle$    return jsonb_build_object('claimed',true,'leaseId',v_lease,'lastId',v_last,'links',v_links);$needle$;
  if position(v_before in v_definition)=0 or position('start_sync_run' in v_definition)>0 then
    raise exception 'Runtime de consulta mudou; rebase necessário.'; end if;
  v_definition:=replace(v_definition,v_before,
    '    perform internal_proesc.start_sync_run(v_actor,v_lease);'||E'\n'||v_before);
  v_before:=$needle$  update internal_proesc.sync_runtime set
    cursor_id=case when v_completed>0 then v_state.lease_links[v_completed] else cursor_id end,$needle$;
  if position(v_before in v_definition)=0 then raise exception 'Finalização da concessão mudou; rebase necessário.'; end if;
  v_definition:=replace(v_definition,v_before,
    '  perform internal_proesc.finish_sync_run(v_state,p_payload);'||E'\n'||v_before);
  execute v_definition;
end;
$instrument_runtime$;
commit;
