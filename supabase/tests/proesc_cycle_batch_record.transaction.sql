-- Requires an actually observed fresh source cache. Never refresh its clock.
begin;
set local request.jwt.claims='{"role":"service_role"}';
set local statement_timeout='30s';
/* __BATCH_IDENTIFIER_MIGRATION__ */
create temporary table cycle_batch_result(result jsonb) on commit drop;
do $record_contract$
declare
  v_actor uuid; v_group jsonb; v_cache uuid; v_lease uuid:=gen_random_uuid();
  v_result jsonb; v_ids jsonb; v_before text; v_after text;
begin
  select updated_by into strict v_actor from internal_proesc.connection where id;
  select g into strict v_group from jsonb_array_elements(
    public.proesc_cycle_review_batch_service('targets',v_actor,null)->'groups') g
    where jsonb_array_length(g->'matriculaIds')>=20 limit 1;
  select id into strict v_cache from internal_proesc.cycle_review_cache
    where unit_id=v_group->>'unitId' and first_year=(v_group->>'firstYear')::int
      and last_year=(v_group->>'lastYear')::int and state='COMPLETE'
      and observed_at>now()-interval '5 minutes';
  select jsonb_agg(id) into v_ids from jsonb_array_elements(v_group->'matriculaIds')
    with ordinality as requested(id,n) where n<=20;
  select md5(jsonb_agg(to_jsonb(c) order by c.id)::text) into v_before
    from public.contas_receber c where c.matricula_id in
      (select requested.value::uuid from jsonb_array_elements_text(v_ids) as requested(value));
  update internal_proesc.cycle_review_runtime set round_active=true,lease_id=v_lease,
    lease_until=now()+interval '4 minutes',
    credential_revision=(select revision from internal_proesc.connection where id) where id;
  v_result:=public.proesc_cycle_review_batch_service('record',v_actor,null,
    jsonb_build_object('cacheId',v_cache,'workerLease',v_lease,'matriculaIds',jsonb_build_array(v_ids->0)));
  assert v_result->'reviewed'='1' and v_result->'failed'='0','Single enrollment batch must record';
  v_result:=public.proesc_cycle_review_batch_service('record',v_actor,null,
    jsonb_build_object('cacheId',v_cache,'workerLease',v_lease,'matriculaIds',v_ids));
  assert v_result->'reviewed'='20' and v_result->'failed'='0','Full20 enrollment batch must record';
  assert (select cardinality(completed_ids)=20 from internal_proesc.cycle_review_runtime where id),
    'Repeated enrollment must not duplicate cursor progress';
  select md5(jsonb_agg(to_jsonb(c) order by c.id)::text) into v_after
    from public.contas_receber c where c.matricula_id in
      (select requested.value::uuid from jsonb_array_elements_text(v_ids) as requested(value));
  assert v_before=v_after,'Batch review must not mutate any receivable';
  insert into cycle_batch_result values(v_result);
end;
$record_contract$;
select * from cycle_batch_result;
rollback;
