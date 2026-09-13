-- Qualify JSON scalar aliases inside correlated enrollment validation.
begin;
do $batch_identifiers$
declare v_definition text;
begin
  v_definition:=pg_get_functiondef('public.proesc_cycle_review_batch_service(text,uuid,uuid,jsonb)'::regprocedure);
  if position('where m.id in(select id::uuid from jsonb_array_elements_text(v_ids) id)' in v_definition)=0
    or position('count(distinct id) from jsonb_array_elements_text(v_ids) id' in v_definition)=0 then
    raise exception 'Batch validation changed; rebase required.';
  end if;
  v_definition:=replace(v_definition,
    'jsonb_array_elements_text(v_ids) id where id !~',
    'jsonb_array_elements_text(v_ids) as requested(value) where requested.value !~');
  v_definition:=replace(v_definition,
    'count(distinct id) from jsonb_array_elements_text(v_ids) id',
    'count(distinct requested.value) from jsonb_array_elements_text(v_ids) as requested(value)');
  v_definition:=replace(v_definition,
    'select id::uuid from jsonb_array_elements_text(v_ids) id',
    'select requested.value::uuid from jsonb_array_elements_text(v_ids) as requested(value)');
  execute v_definition;
end;
$batch_identifiers$;
notify pgrst,'reload schema';
commit;
