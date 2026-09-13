-- Run via MCP only; inject the two unapplied migrations at the marker.
-- Synthetic cache/evidence remain inside this rolled-back transaction.
begin;
set local request.jwt.claims='{"role":"service_role"}';
/* __API_CYCLE_REVIEW_MIGRATIONS__ */

do $schedule_contract$
declare
  v_rows jsonb; v_context jsonb; v_result jsonb; v_changed jsonb;
begin
  select jsonb_agg(jsonb_build_object('key',n::text,'classId','2','personHash',repeat('a',64),
    'amountCents',27990,'dueDate',to_char(date '2026-01-15'+((n-1)||' months')::interval,'YYYY-MM-DD'),
    'createdDate','2026-01-01','unsafe',false) order by n) into v_rows from generate_series(1,12) n;
  v_context:=jsonb_build_object('classId','2','personHash',repeat('a',64),
    'startDate','2026-01-01','academicReady',true,'obligations',v_rows);
  v_result:=internal_proesc.evaluate_api_cycle_schedule(v_context,v_rows);
  assert v_result->>'classification'='C1','12 coherent monthly items must prove C1 without an API enrollment fee';
  assert internal_proesc.evaluate_api_cycle_schedule(
    v_context||'{"academicReady":false}',v_rows)->>'classification'='UNKNOWN';
  assert internal_proesc.evaluate_api_cycle_schedule(
    v_context||'{"startDate":"2026-04-01"}',v_rows)->>'classification'='UNKNOWN';
  assert internal_proesc.evaluate_api_cycle_schedule(v_context,v_rows-11)->>'classification'='UNKNOWN';
  assert internal_proesc.evaluate_api_cycle_schedule(v_context,
    jsonb_set(v_rows,'{0,unsafe}','true'))->>'classification'='UNKNOWN';
  assert internal_proesc.evaluate_api_cycle_schedule(v_context,
    jsonb_set(v_rows,'{0,personHash}','null'))->>'classification'='UNKNOWN';
  assert internal_proesc.evaluate_api_cycle_schedule(v_context,
    jsonb_set(v_rows,'{0,createdDate}','"2026-01-02"'))->>'classification'='UNKNOWN';
  assert internal_proesc.evaluate_api_cycle_schedule(v_context,
    jsonb_set(v_rows,'{1,dueDate}','"2026-01-16"'))->>'classification'='UNKNOWN';
  assert internal_proesc.evaluate_api_cycle_schedule(v_context,
    jsonb_set(v_rows,'{0,key}','"999"'))->>'classification'='UNKNOWN';
  select jsonb_agg(jsonb_build_object('key',n::text,'classId','2','personHash',repeat('a',64),
    'amountCents',case when n=25 then 10000 else 27990 end,
    'dueDate',to_char(date '2026-01-15'+((n-1)||' months')::interval,'YYYY-MM-DD'),
    'createdDate','2026-01-01','unsafe',false) order by n) into v_changed from generate_series(1,25) n;
  assert internal_proesc.evaluate_api_cycle_schedule(v_context,v_changed)->>'classification'='FULL',
    'Second-cycle evidence protects even obligations not yet imported';
end;
$schedule_contract$;

do $integration_contract$
declare
  v_actor uuid; v_enrollment uuid; v_context jsonb; v_begin jsonb; v_rows jsonb;
  v_response jsonb; v_periods jsonb; v_cache uuid; v_policy text; v_preview jsonb;
  v_before text; v_after text; v_hash text; v_seen timestamptz; v_revision integer;
  v_seed uuid; v_limited_actor uuid; v_outside_enrollment uuid;
begin
  select updated_by into strict v_actor from internal_proesc.connection where id;
  select m.id into strict v_seed from public.matriculas m
    join internal_proesc.class_scopes s on s.turma_id=m.turma_id
    where s.batch_id is null and s.financial_mode='CICLO1_PROESC' and m.status='PENDENTE'
      and not exists(select 1 from internal_academic.technical_manual_cycle_runs r where r.matricula_id=m.id)
      and not exists(select 1 from internal_academic.technical_external_cycle_coverage c where c.matricula_id=m.id)
    order by m.id limit 1;
  assert internal_proesc.cycle_review_context(v_seed)->'academicReady'='true',
    'Existing T42 PENDENTE status must retain its established academic eligibility';
  assert internal_academic.technical_manual_cycle_state(v_seed)#>>'{conferenciaProesc,necessaria}'='true',
    'Unissued T42 enrollments must require the same fresh API preflight';
  assert not exists(select 1 from internal_proesc.enrollment_sources where matricula_id=v_seed),
    'T42 must use its reconciled source without invented academic import records';
  select u.id,m.id into v_limited_actor,v_outside_enrollment from public.usuarios_sistema u
    left join public.perfis_acesso p on p.id=u.perfil_acesso_id
    cross join public.matriculas m join internal_proesc.class_scopes s on s.turma_id=m.turma_id
    where lower(u.status) in ('ativo','active') and lower(u.perfil)='gestor' and u.auth_user_id is not null
      and coalesce((case when p.id is not null and not coalesce(u.personalizar_permissoes,false)
        then p.permissoes else u.permissoes end)->'allPolos','false')<>'true'
      and not(s.polo_id=any(coalesce(u.polo_ids,array[]::uuid[])))
      and s.polo_id::text is distinct from u.context limit 1;
  assert v_limited_actor is not null,'Existing limited actor fixture required';
  begin
    perform internal_proesc.authorize_cycle_review(v_limited_actor,v_outside_enrollment);
    raise exception 'Actor outside the class polo must not access its source review';
  exception when insufficient_privilege then null; end;
  select m.id into strict v_enrollment from public.matriculas m
    join internal_proesc.class_scopes s on s.turma_id=m.turma_id
    join internal_proesc.enrollment_sources a on a.matricula_id=m.id
    where s.class_code='ENF-T45-SEM-PDF' and m.status='ATIVO'
      and a.source_verified and a.source_status='CURSANDO'
      and (select count(*)=12 and min(c.valor)=279.90 and max(c.valor)=279.90
        and count(distinct date_trunc('month',c.data_vencimento))=12
        and min(c.data_vencimento)>=greatest((s.class_spec->>'startDate')::date,a.source_enrolled_at::date)
        and date_trunc('month',min(c.data_vencimento))<=date_trunc('month',
          greatest((s.class_spec->>'startDate')::date,a.source_enrolled_at::date))+interval '1 month'
        and max(c.data_vencimento)-min(c.data_vencimento) between 330 and 340
        from public.contas_receber c join internal_proesc.obligation_links l on l.receivable_id=c.id
        where l.matricula_id=m.id) order by m.id limit 1;
  select md5(jsonb_agg(to_jsonb(c) order by c.id)::text) into v_before
    from public.contas_receber c where c.matricula_id=v_enrollment;
  v_context:=internal_proesc.cycle_review_context(v_enrollment);
  v_begin:=public.proesc_cycle_review_cache_service('begin',v_actor,v_enrollment);
  assert v_begin->'cached'='false','Fresh test must acquire a source lease';
  assert public.proesc_cycle_review_cache_service('begin',v_actor,v_enrollment)->'busy'='true',
    'Concurrent source collection must not duplicate its requests';
  v_cache:=(v_begin->>'cacheId')::uuid;
  select jsonb_agg(r||jsonb_build_object('classId',v_context->>'classId',
    'personHash',v_context->>'personHash','unsafe',false,'createdDate',v_context->>'startDate')
    order by r->>'key') into v_rows from jsonb_array_elements(v_context->'obligations') r;
  select jsonb_agg(jsonb_build_object('year',y,'month',m,'complete',true)) into v_periods
    from generate_series((v_context->>'firstYear')::int,(v_context->>'lastYear')::int) y
    cross join generate_series(1,12) m;
  begin
    perform public.proesc_cycle_review_cache_service('complete',v_actor,v_enrollment,
      jsonb_build_object('cacheId',v_cache,'lease',v_begin->>'lease','obligations',v_rows,'periods',v_periods-0));
    raise exception 'Partial source collection must fail';
  exception when invalid_parameter_value then null; end;
  perform public.proesc_cycle_review_cache_service('complete',v_actor,v_enrollment,
    jsonb_build_object('cacheId',v_cache,'lease',v_begin->>'lease','obligations',v_rows,'periods',v_periods));
  v_response:=public.proesc_record_api_cycle_review_service(v_actor,v_enrollment,v_cache);
  assert v_response->>'classification'='C1' and v_response->'eligible'='true',
    'Complete, source-bound C1 must enable only the second-cycle workflow';
  assert internal_proesc.has_confirmed_first_cycle_only(v_enrollment);
  assert internal_academic.technical_manual_cycle_state(v_enrollment)#>>'{conferenciaProesc,necessaria}'='true';
  v_preview:=internal_academic.technical_manual_cycle_preview(v_enrollment,2,current_date+30);
  assert jsonb_array_length(v_preview#>'{preview,itens}')=13,'C2 must preview renewal plus12 monthly items';
  select revision into v_revision from internal_proesc.enrollment_cycle_evidence where matricula_id=v_enrollment;
  perform public.proesc_record_api_cycle_review_service(v_actor,v_enrollment,v_cache);
  assert (select revision=v_revision from internal_proesc.enrollment_cycle_evidence where matricula_id=v_enrollment),
    'Reviewing unchanged cached source must preserve preview fingerprints';
  select source_hash,observed_at into v_hash,v_seen from internal_proesc.cycle_review_cache where id=v_cache;
  update internal_proesc.cycle_review_cache set source_hash=repeat('0',64) where id=v_cache;
  assert not internal_proesc.has_confirmed_first_cycle_only(v_enrollment),'New API obligations must invalidate C1';
  update internal_proesc.cycle_review_cache set source_hash=v_hash,observed_at=now()-interval '6 minutes' where id=v_cache;
  assert not internal_proesc.has_confirmed_first_cycle_only(v_enrollment),'Expired C1 must require API preflight';
  update internal_proesc.cycle_review_cache set observed_at=v_seen where id=v_cache;
  update internal_proesc.enrollment_cycle_evidence set obligation_manifest_hash=repeat('0',64) where matricula_id=v_enrollment;
  assert not internal_proesc.has_confirmed_first_cycle_only(v_enrollment),'Local manifest changes must invalidate C1';
  select md5(jsonb_agg(to_jsonb(c) order by c.id)::text) into v_after
    from public.contas_receber c where c.matricula_id=v_enrollment;
  assert v_before=v_after,'Review and preview must not change receivables, paid values or gateway identity';
  assert not has_function_privilege('authenticated',
    'public.proesc_record_api_cycle_review_service(uuid,uuid,uuid)','EXECUTE');
  assert not has_function_privilege('authenticated',
    'public.proesc_cycle_review_cache_service(text,uuid,uuid,jsonb)','EXECUTE');
end;
$integration_contract$;
select 'Derived source schedule, scoped cache, source changes, expiration, idempotence and preserved payments verified.' as result;
rollback;
