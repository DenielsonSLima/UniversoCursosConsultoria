-- Read-only contract checks after the prepared migrations, no enqueue or HTTP.
do $proesc_readonly_guards$
declare
  v_claim_role text:=current_setting('request.jwt.claim.role',true);
  v_claim_sub text:=current_setting('request.jwt.claim.sub',true);
  v_claims text:=current_setting('request.jwt.claims',true);
  v_definition text;
  v_name text;
begin
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform set_config('request.jwt.claim.role','service_role',true);
  begin
    perform public.proesc_sync_runtime_service('authorize',null,jsonb_build_object('key',repeat('0',64)));
    raise exception 'Unrelated internal worker key was accepted';
  exception when sqlstate '42501' then null; end;
  begin
    perform public.proesc_sync_runtime_service('authorize',null,'{}'::jsonb);
    raise exception 'Missing internal worker key was accepted';
  exception when sqlstate '42501' then null; end;
  begin
    perform public.proesc_sync_runtime_service('authorize',null,'{"key":"invalid"}'::jsonb);
    raise exception 'Malformed internal worker key was accepted';
  exception when sqlstate '42501' then null; end;
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  begin
    perform public.proesc_sync_runtime_service('claim',null,'{}'::jsonb);
    raise exception 'Ordinary session obtained a worker lease';
  exception when sqlstate '42501' then null; end;
  perform set_config('request.jwt.claims',coalesce(v_claims,''),true);
  perform set_config('request.jwt.claim.role',coalesce(v_claim_role,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(v_claim_sub,''),true);
  foreach v_name in array array[
    'public.get_receivables_modality_page_v3_secure(text,uuid,uuid,text,date,date,text,text,text,integer,integer)',
    'public.get_receivables_modality_groups_page_v3_secure(text,uuid,uuid,text,date,date,text,text,integer,integer)'
  ] loop
    v_definition:=pg_get_functiondef(v_name::regprocedure);
    assert position('cr.categoria = ''OUTROS_CREDITOS''' in v_definition)>0,'Linked generic source history remains hidden';
    assert position('proesc_link.receivable_id = cr.id' in v_definition)>0,'Visibility lost exact source link guard';
    assert position('proesc_scope.polo_id = cr.polo_id' in v_definition)>0,'Visibility lost owner-polo identity';
    assert position('proesc_scope.phase = ''CONFIRMED''' in v_definition)>0,'Unconfirmed class scope became visible';
  end loop;
  assert not has_function_privilege('authenticated','public.proesc_import_original_obligation_service(uuid,uuid,jsonb)','execute'),
    'Ordinary session can import financial obligations';
  assert not has_function_privilege('anon','public.proesc_import_original_obligation_service(uuid,uuid,jsonb)','execute'),
    'Anonymous session can import financial obligations';
  assert not has_table_privilege('authenticated','internal_proesc.obligation_imports','select'),
    'Private financial identities are exposed';
  raise notice 'Financial source visibility and internal authorization read-only checks passed';
end;
$proesc_readonly_guards$;
